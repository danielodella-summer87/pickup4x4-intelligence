/**
 * Parser XML mínimo y estricto para respuestas SOAP de KORE (sin dependencias).
 *
 * Soporta elementos, atributos, texto, CDATA, comentarios, instrucciones de
 * procesamiento y entidades predefinidas / numéricas. Rechaza DOCTYPE (sin DTD
 * ni entidades externas) y documentos mal formados.
 *
 * Los namespaces no se resuelven: cada elemento expone `prefix` y `localName`
 * y las búsquedas se hacen por nombre local.
 *
 * Los mensajes de error nunca incluyen fragmentos del contenido del documento.
 */

export type XmlText = { readonly type: "text"; readonly value: string };

export type XmlElement = {
  readonly type: "element";
  readonly name: string;
  readonly prefix: string | null;
  readonly localName: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: XmlNode[];
};

export type XmlNode = XmlElement | XmlText;

export class XmlParseError extends Error {
  readonly position: number;

  constructor(message: string, position: number) {
    super(`${message} (posición ${position})`);
    this.name = "XmlParseError";
    this.position = position;
  }
}

const NAME_PATTERN = /[\p{L}_][\p{L}\p{N}_.:-]*/uy;

const PREDEFINED_ENTITIES: Readonly<Record<string, string>> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
};

function isWhitespace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
}

function decodeEntities(raw: string, offset: number): string {
  if (!raw.includes("&")) return raw;

  let out = "";
  let index = 0;
  while (index < raw.length) {
    const amp = raw.indexOf("&", index);
    if (amp === -1) {
      out += raw.slice(index);
      break;
    }
    out += raw.slice(index, amp);

    const semicolon = raw.indexOf(";", amp);
    if (semicolon === -1) {
      throw new XmlParseError("Entidad XML sin cerrar", offset + amp);
    }
    const entity = raw.slice(amp + 1, semicolon);

    if (entity.startsWith("#")) {
      const isHex = entity[1] === "x" || entity[1] === "X";
      const digits = entity.slice(isHex ? 2 : 1);
      const valid = isHex ? /^[0-9a-fA-F]+$/.test(digits) : /^[0-9]+$/.test(digits);
      const codePoint = valid ? Number.parseInt(digits, isHex ? 16 : 10) : Number.NaN;
      if (
        !valid ||
        codePoint === 0 ||
        codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
      ) {
        throw new XmlParseError("Referencia numérica XML inválida", offset + amp);
      }
      out += String.fromCodePoint(codePoint);
    } else if (Object.prototype.hasOwnProperty.call(PREDEFINED_ENTITIES, entity)) {
      out += PREDEFINED_ENTITIES[entity];
    } else {
      throw new XmlParseError("Entidad XML desconocida", offset + amp);
    }

    index = semicolon + 1;
  }
  return out;
}

export function parseXml(input: string): XmlElement {
  const length = input.length;
  let pos = input.charCodeAt(0) === 0xfeff ? 1 : 0;
  const stack: XmlElement[] = [];
  const state: { root: XmlElement | null } = { root: null };

  const readName = (): string => {
    NAME_PATTERN.lastIndex = pos;
    const match = NAME_PATTERN.exec(input);
    if (!match) throw new XmlParseError("Nombre XML inválido", pos);
    pos += match[0].length;
    return match[0];
  };

  const skipWhitespace = (): boolean => {
    const start = pos;
    while (pos < length && isWhitespace(input.charCodeAt(pos))) pos += 1;
    return pos > start;
  };

  const appendText = (value: string, at: number): void => {
    const parent = stack[stack.length - 1];
    if (!parent) {
      if (value.trim() !== "") throw new XmlParseError("Texto fuera del elemento raíz", at);
      return;
    }
    const last = parent.children[parent.children.length - 1];
    if (last && last.type === "text") {
      parent.children[parent.children.length - 1] = { type: "text", value: last.value + value };
    } else {
      parent.children.push({ type: "text", value });
    }
  };

  while (pos < length) {
    const lt = input.indexOf("<", pos);
    if (lt === -1) {
      appendText(decodeEntities(input.slice(pos), pos), pos);
      pos = length;
      break;
    }
    if (lt > pos) {
      appendText(decodeEntities(input.slice(pos, lt), pos), pos);
      pos = lt;
    }

    if (input.startsWith("<?", pos)) {
      const end = input.indexOf("?>", pos + 2);
      if (end === -1) throw new XmlParseError("Instrucción de procesamiento sin cerrar", pos);
      pos = end + 2;
      continue;
    }

    if (input.startsWith("<!--", pos)) {
      const end = input.indexOf("-->", pos + 4);
      if (end === -1) throw new XmlParseError("Comentario XML sin cerrar", pos);
      pos = end + 3;
      continue;
    }

    if (input.startsWith("<![CDATA[", pos)) {
      const end = input.indexOf("]]>", pos + 9);
      if (end === -1) throw new XmlParseError("CDATA sin cerrar", pos);
      if (stack.length === 0) throw new XmlParseError("CDATA fuera del elemento raíz", pos);
      appendText(input.slice(pos + 9, end), pos);
      pos = end + 3;
      continue;
    }

    if (input.startsWith("<!", pos)) {
      throw new XmlParseError("DOCTYPE y declaraciones DTD no están permitidos", pos);
    }

    if (input.startsWith("</", pos)) {
      const at = pos;
      pos += 2;
      const name = readName();
      skipWhitespace();
      if (input[pos] !== ">") throw new XmlParseError("Se esperaba '>' en etiqueta de cierre", pos);
      pos += 1;
      const open = stack.pop();
      if (!open || open.name !== name) {
        throw new XmlParseError("Etiqueta de cierre inesperada", at);
      }
      continue;
    }

    const at = pos;
    pos += 1;
    const name = readName();
    const attributes: Record<string, string> = Object.create(null);
    let selfClosing = false;

    for (;;) {
      const hadWhitespace = skipWhitespace();
      if (pos >= length) throw new XmlParseError("Etiqueta sin cerrar", at);
      if (input.startsWith("/>", pos)) {
        selfClosing = true;
        pos += 2;
        break;
      }
      if (input[pos] === ">") {
        pos += 1;
        break;
      }
      if (!hadWhitespace) throw new XmlParseError("Se esperaba espacio entre atributos", pos);

      const attributeName = readName();
      skipWhitespace();
      if (input[pos] !== "=") throw new XmlParseError("Se esperaba '=' en atributo", pos);
      pos += 1;
      skipWhitespace();

      const quote = input[pos];
      if (quote !== '"' && quote !== "'") {
        throw new XmlParseError("Valor de atributo sin comillas", pos);
      }
      const end = input.indexOf(quote, pos + 1);
      if (end === -1) throw new XmlParseError("Valor de atributo sin cerrar", pos);
      const rawValue = input.slice(pos + 1, end);
      if (rawValue.includes("<")) {
        throw new XmlParseError("Carácter '<' inválido en atributo", pos);
      }
      if (Object.prototype.hasOwnProperty.call(attributes, attributeName)) {
        throw new XmlParseError("Atributo duplicado", pos);
      }
      attributes[attributeName] = decodeEntities(rawValue, pos + 1);
      pos = end + 1;
    }

    const colon = name.indexOf(":");
    const element: XmlElement = {
      type: "element",
      name,
      prefix: colon === -1 ? null : name.slice(0, colon),
      localName: colon === -1 ? name : name.slice(colon + 1),
      attributes,
      children: [],
    };

    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(element);
    } else {
      if (state.root) throw new XmlParseError("Más de un elemento raíz", at);
      state.root = element;
    }
    if (!selfClosing) stack.push(element);
  }

  if (stack.length > 0) throw new XmlParseError("Elemento sin cerrar", length);
  if (!state.root) throw new XmlParseError("Documento XML sin elemento raíz", length);
  return state.root;
}

/** Hijos directos de tipo elemento, opcionalmente filtrados por nombre local. */
export function childElements(element: XmlElement, localName?: string): XmlElement[] {
  return element.children.filter(
    (child): child is XmlElement =>
      child.type === "element" && (localName === undefined || child.localName === localName),
  );
}

export function firstChildElement(element: XmlElement, localName: string): XmlElement | undefined {
  return childElements(element, localName)[0];
}

/** Texto concatenado del nodo y todos sus descendientes. */
export function textContent(node: XmlNode): string {
  return node.type === "text" ? node.value : node.children.map(textContent).join("");
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

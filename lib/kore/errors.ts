/**
 * Errores tipados de la integración KORE.
 *
 * Los mensajes se construyen ya sanitizados: nunca deben contener la
 * SecretKey ni el XML enviado. No se adjunta el error original (`cause`)
 * para no arrastrar detalles del request; solo su código, si existe.
 */

export type KoreErrorKind =
  | "config"
  | "invalid_argument"
  | "operation_not_allowed"
  | "network"
  | "timeout"
  | "http"
  | "response_too_large"
  | "soap_fault"
  | "parse"
  | "invalid_data";

export type KoreErrorDetails = {
  kind: KoreErrorKind;
  message: string;
  operation?: string;
  httpStatus?: number;
  faultCode?: string;
  causeCode?: string;
};

export class KoreError extends Error {
  readonly kind: KoreErrorKind;
  readonly operation: string | undefined;
  readonly httpStatus: number | undefined;
  readonly faultCode: string | undefined;
  readonly causeCode: string | undefined;

  constructor(details: KoreErrorDetails) {
    super(details.message);
    this.name = "KoreError";
    this.kind = details.kind;
    this.operation = details.operation;
    this.httpStatus = details.httpStatus;
    this.faultCode = details.faultCode;
    this.causeCode = details.causeCode;
  }

  toJSON(): KoreErrorDetails & { name: string } {
    return {
      name: this.name,
      kind: this.kind,
      message: this.message,
      operation: this.operation,
      httpStatus: this.httpStatus,
      faultCode: this.faultCode,
      causeCode: this.causeCode,
    };
  }
}

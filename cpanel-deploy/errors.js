// Error con código HTTP para respuestas de validación (400), no encontrado (404), conflicto (409), etc.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

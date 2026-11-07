// El paquete apperr define errores tipados de la aplicación traducidos una sola vez a respuestas HTTP estables.
package apperr

import (
	"errors"
	"net/http"
)

type Error struct {
	Status  int
	Code    string
	Message string
	Fields  map[string]string
	Err     error
}

func (e *Error) Error() string {
	if e.Err != nil {
		return e.Code + ": " + e.Err.Error()
	}
	return e.Code + ": " + e.Message
}

func (e *Error) Unwrap() error { return e.Err }

func New(status int, code, message string) *Error {
	return &Error{Status: status, Code: code, Message: message}
}

func Invalid(message string, fields map[string]string) *Error {
	return &Error{Status: http.StatusUnprocessableEntity, Code: "validation_error", Message: message, Fields: fields}
}

func Unauthorized(message string) *Error {
	return New(http.StatusUnauthorized, "unauthorized", message)
}

func Forbidden(message string) *Error {
	return New(http.StatusForbidden, "forbidden", message)
}

func NotFound(message string) *Error {
	return New(http.StatusNotFound, "not_found", message)
}

func Conflict(code, message string) *Error {
	return New(http.StatusConflict, code, message)
}

// ConflictFields conserva el código funcional estable y añade errores por campo.
func ConflictFields(code, message string, fields map[string]string) *Error {
	e := Conflict(code, message)
	e.Fields = fields
	return e
}

func Internal(err error) *Error {
	return &Error{Status: http.StatusInternalServerError, Code: "internal_error", Message: "Error interno del servidor.", Err: err}
}

func BadRequest(message string) *Error {
	return New(http.StatusBadRequest, "bad_request", message)
}

func TooManyRequests(message string) *Error {
	return New(http.StatusTooManyRequests, "rate_limited", message)
}

// As extrae un *Error o envuelve cualquier otro valor como un 500.
func As(err error) *Error {
	var e *Error
	if errors.As(err, &e) {
		return e
	}
	return Internal(err)
}

# syntax=docker/dockerfile:1
# Imagen de desarrollo: incluye el toolchain de Go para que las pruebas se ejecuten dentro de Docker.
FROM golang:1.27-alpine
RUN apk add --no-cache ca-certificates git tzdata
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build ./...
EXPOSE 8080
CMD ["go", "run", "./cmd/api"]

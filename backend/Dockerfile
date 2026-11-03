# syntax=docker/dockerfile:1
# Development image: includes the Go toolchain so tests run inside Docker.
FROM golang:1.27-alpine
RUN apk add --no-cache ca-certificates git tzdata
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build ./...
EXPOSE 8080
CMD ["go", "run", "./cmd/api"]

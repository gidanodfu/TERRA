# syntax=docker/dockerfile:1

ARG AIR_VERSION=v1.67.4

# Imagen de desarrollo: toolchain de Go, Air y herramientas de pruebas.
# El código se monta en /src y Air recompila API/worker ante cambios.
FROM golang:1.27-alpine AS development
ARG AIR_VERSION
RUN apk add --no-cache ca-certificates git tzdata \
    && go install github.com/air-verse/air@${AIR_VERSION}
ENV PATH="/go/bin:${PATH}"
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build ./...
EXPOSE 8080
CMD ["air", "-c", ".air.api.toml"]

# Compilación reproducible para producción.
FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
ARG VERSION=dev
ARG BUILD_TIME=unknown
RUN CGO_ENABLED=0 go build -trimpath \
        -ldflags "-s -w -X main.buildVersion=${VERSION} -X main.buildTime=${BUILD_TIME}" \
        -o /out/api ./cmd/api \
    && CGO_ENABLED=0 go build -trimpath \
        -ldflags "-s -w -X main.buildVersion=${VERSION} -X main.buildTime=${BUILD_TIME}" \
        -o /out/worker ./cmd/worker \
    && CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o /out/migrate ./cmd/migrate \
    && CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o /out/bootstrap ./cmd/bootstrap

# Imagen final: binarios, CA, zona horaria y usuario no privilegiado.
# No incluye Go, Air, código fuente ni herramientas de desarrollo.
FROM alpine:3.22 AS production
RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S terra \
    && adduser -S -G terra -h /app terra
WORKDIR /app
COPY --from=build /out/ /app/
USER terra
EXPOSE 8080
ENTRYPOINT ["/app/api"]

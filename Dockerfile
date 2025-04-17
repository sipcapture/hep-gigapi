FROM oven/bun
WORKDIR /app
COPY . .
RUN bun install
EXPOSE 9060/udp
EXPOSE 9060/tcp
ENTRYPOINT [ "bun", "run", "hep-server.js" ]

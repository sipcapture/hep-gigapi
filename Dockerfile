FROM oven/bun
WORKDIR /usr/src/app
COPY . .
RUN bun install
USER bun
EXPOSE 9060/tcp
ENTRYPOINT [ "bun", "run", "hep-server.js" ]

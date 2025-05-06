# Set ARG for Node.js version
ARG ARCH=linux/amd64
ARG NODE_VERSION=22.3

# TODO: install foundry on our node images
FROM --platform=${ARCH} node:${NODE_VERSION} AS node

FROM --platform=${ARCH} ghcr.io/foundry-rs/foundry:latest AS build

# foundry recently changed their dockerfile permissions so we need this to build now
USER root

# we copy the bin from the node image to foundry (which uses alpine)
COPY --from=node /usr/lib /usr/lib
COPY --from=node /usr/local/lib /usr/local/lib
COPY --from=node /usr/local/include /usr/local/include
COPY --from=node /usr/local/bin /usr/local/bin

WORKDIR /app

COPY . .

RUN npm install
RUN npm run build

FROM --platform=${ARCH} node:${NODE_VERSION} AS runner
# Define the command to run the application
WORKDIR /app
COPY --from=build /app/index.cjs .
CMD ["node", "/app/index.cjs"]

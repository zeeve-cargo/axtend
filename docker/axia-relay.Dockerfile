# Inspired by Axia Dockerfile

FROM docker.io/axiatech/ci-linux:production as builder
LABEL maintainer "alan@purestake.com"
LABEL description="This is the build stage for Axia. Here we create the binary."

ARG AXIA_COMMIT=master
ARG AXIA_REPO=https://github.com/axiatech/axia
RUN echo "Using axia ${AXIA_COMMIT}"
WORKDIR /

# Grab the Axia Code
# TODO how to grab the correct commit from the lock file?
RUN git clone ${AXIA_REPO}
WORKDIR /axia
RUN git checkout ${AXIA_COMMIT}

# RUN sed -i 's/pub const EPOCH_DURATION_IN_SLOTS: BlockNumber = 1 \* HOURS/pub const EPOCH_DURATION_IN_SLOTS: BlockNumber = 2 \* MINUTES/' runtime/*/src/constants.rs
# Download rust dependencies and build the rust binary
RUN cargo build --profile production --locked

# ===== SECOND STAGE ======

FROM debian:buster-slim
LABEL maintainer "alan@purestake.com"
LABEL description="Axia for Axtend Relay Chains"
COPY --from=builder /axia/target/production/axia /usr/local/bin

RUN useradd -m -u 1000 -U -s /bin/sh -d /moonbase-alphanet axtend && \
	mkdir -p /moonbase-alphanet/.local/share/moonbase-alphanet && \
	chown -R axtend:axtend /moonbase-alphanet && \
	ln -s /moonbase-alphanet/.local/share/moonbase-alphanet /data && \
	rm -rf /usr/bin /usr/sbin

USER axtend

COPY --chown=axtend specs/alphanet/alphanet-embedded-specs-v8.json /moonbase-alphanet/alphanet-relay-raw-specs.json
RUN grep -v '/p2p/' /moonbase-alphanet/alphanet-relay-raw-specs.json > \
    /moonbase-alphanet/alphanet-relay-raw-specs-no-bootnodes.json

# 30333 for p2p traffic
# 9933 for RPC call
# 9944 for Websocket
# 9615 for Prometheus (metrics)
EXPOSE 30333 9933 9944 9615

VOLUME ["/data"]

CMD ["/usr/local/bin/axia"]

# Node for Axtend networks

ARG DOCKER_IMAGE
ARG SHA
FROM "$DOCKER_IMAGE:$SHA"
USER axtend

COPY --chown=axtend build/axtend /axtend/axtend
RUN chmod uog+x /axtend/axtend

ARG CS_BASE_IMAGE=yohimik/cs-web-server@sha256:1618f2cf059f2f5857f09701846767ce4089efcc41d776a47acdfa6f994ccda2
FROM ${CS_BASE_IMAGE}

USER root
COPY addons/yapb/ /xashds/cstrike/addons/yapb/
COPY start-yapb.sh /usr/local/bin/start-yapb

RUN sed -i 's|^gamedll_linux .*|gamedll_linux "addons/yapb/bin/yapb.so"|' /xashds/cstrike/liblist.gam
RUN grep -Fq 'gamedll_linux "addons/yapb/bin/yapb.so"' /xashds/cstrike/liblist.gam
RUN test -s /xashds/cstrike/addons/yapb/bin/yapb.so
RUN test -s /xashds/cstrike/addons/yapb/data/graph/de_dust2.graph
RUN mkdir -p /xashds/cstrike/addons/yapb/data/logs \
      /xashds/cstrike/addons/yapb/data/pwf \
      /xashds/cstrike/addons/yapb/data/train && \
    find /xashds/cstrike/addons/yapb -type d -exec chmod 0755 '{}' + && \
    chmod 0755 /usr/local/bin/start-yapb && \
    chown -R xashds:xashds /xashds/cstrike/addons/yapb /xashds/cstrike/liblist.gam

USER xashds
ENTRYPOINT ["/usr/local/bin/start-yapb"]

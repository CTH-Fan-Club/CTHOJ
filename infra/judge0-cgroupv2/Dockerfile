FROM judge0/judge0:1.13.1

USER root

ARG ISOLATE_COMMIT=19ec4bd3fac386ae4cb95a7d43d8188710154661

RUN printf '%s\n' \
      'deb http://mirrors.tencentyun.com/debian buster main' \
      > /etc/apt/sources.list && \
    rm -rf /etc/apt/sources.list.d/* && \
    printf '%s\n' \
      'Acquire::Check-Valid-Until "false";' \
      'Acquire::AllowInsecureRepositories "true";' \
      > /etc/apt/apt.conf.d/99archive && \
    apt-get update && \
    apt-get install -y --no-install-recommends libcap-dev && \
    curl -fsSL --retry 3 \
      http://archive.debian.org/debian/pool/main/libs/libseccomp/libseccomp-dev_2.3.3-4_amd64.deb \
      -o /tmp/libseccomp-dev.deb && \
    dpkg -i /tmp/libseccomp-dev.deb && \
    rm -f /tmp/libseccomp-dev.deb && \
    rm -rf /var/lib/apt/lists/* && \
    git clone https://github.com/ioi/isolate.git /tmp/isolate && \
    cd /tmp/isolate && \
    git checkout "$ISOLATE_COMMIT" && \
    make \
      CFLAGS_HARDEN='-D_FORTIFY_SOURCE=2 -D__NR_io_uring_setup=425 -DSYS_quotactl_fd=443 -fstack-protector-strong -fPIE -pie' \
      LDFLAGS_HARDEN='-Wl,-z,noexecstack -Wl,-z,relro -Wl,-z,now' \
      isolate isolate-check-environment && \
    install -o root -g root -m 4755 isolate /usr/local/bin/isolate && \
    install -o root -g root -m 0755 isolate-check-environment /usr/local/bin/isolate-check-environment && \
    rm -rf /tmp/isolate

COPY judge0-cgroupv2.patch /tmp/judge0-cgroupv2.patch
RUN cd /api && \
    patch -p1 < /tmp/judge0-cgroupv2.patch && \
    rm /tmp/judge0-cgroupv2.patch && \
    mkdir -p /var/local/lib/isolate /run/isolate/locks && \
    printf '%s\n' \
      'box_root = /var/local/lib/isolate' \
      'lock_root = /run/isolate/locks' \
      'cg_root = /sys/fs/cgroup/isolate' \
      'first_uid = 60000' \
      'first_gid = 60000' \
      'num_boxes = 2147483647' \
      'syscall_flags = 0' \
      > /usr/local/etc/isolate

USER judge0

LABEL org.opencontainers.image.title="CTHOJ Judge0 cgroup v2" \
      org.opencontainers.image.version="1.13.1-isolate2.6" \
      org.opencontainers.image.source="https://github.com/judge0/judge0/pull/599"

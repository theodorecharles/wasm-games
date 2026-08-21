#ifndef PORT_IO_H
#define PORT_IO_H

#include <unistd.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <dirent.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#ifndef _A_SUBDIR
#define _A_SUBDIR 0x10
#endif

struct _finddata_t;
static inline int _findnext(long h, struct _finddata_t *data);

struct _finddata_t {
	unsigned attrib;
	long time_create;
	long time_access;
	long time_write;
	unsigned long size;
	char name[260];
};

struct _find_ctx {
	DIR *dir;
	char dirpath[512];
	char pattern[260];
};

static inline int _port_match(const char *pat, const char *name)
{
	if (!pat || !pat[0] || strcmp(pat, "*.*") == 0 || strcmp(pat, "*") == 0) return 1;
	/* very small wildcard: prefix* or exact */
	const char *star = strchr(pat, '*');
	if (!star) return strcasecmp(pat, name) == 0;
	size_t n = (size_t)(star - pat);
	return strncasecmp(pat, name, n) == 0;
}

static inline long _findfirst(const char *spec, struct _finddata_t *data)
{
	char dir[512];
	const char *slash = strrchr(spec, '/');
	const char *bslash = strrchr(spec, '\\');
	const char *sep = slash;
	if (bslash && (!sep || bslash > sep)) sep = bslash;
	const char *pat = spec;
	if (sep) {
		size_t n = (size_t)(sep - spec);
		if (n >= sizeof(dir)) n = sizeof(dir) - 1;
		memcpy(dir, spec, n);
		dir[n] = 0;
		pat = sep + 1;
	} else {
		strcpy(dir, ".");
	}
	DIR *d = opendir(dir);
	if (!d) return -1;
	struct _find_ctx *ctx = (struct _find_ctx *)calloc(1, sizeof(*ctx));
	ctx->dir = d;
	strncpy(ctx->dirpath, dir, sizeof(ctx->dirpath) - 1);
	strncpy(ctx->pattern, pat, sizeof(ctx->pattern) - 1);
	if (_findnext((long)(intptr_t)ctx, data) != 0) {
		closedir(d);
		free(ctx);
		return -1;
	}
	return (long)(intptr_t)ctx;
}

static inline int _findnext(long h, struct _finddata_t *data)
{
	if (h == -1)
		return -1;
	struct _find_ctx *ctx = (struct _find_ctx *)(intptr_t)h;
	if (!ctx || !ctx->dir) return -1;
	struct dirent *ent;
	while ((ent = readdir(ctx->dir)) != NULL) {
		if (!_port_match(ctx->pattern, ent->d_name)) continue;
		memset(data, 0, sizeof(*data));
		strncpy(data->name, ent->d_name, sizeof(data->name) - 1);
		char full[768];
		snprintf(full, sizeof(full), "%s/%s", ctx->dirpath, ent->d_name);
		struct stat st;
		if (stat(full, &st) == 0) {
			data->size = (unsigned long)st.st_size;
			data->time_write = (long)st.st_mtime;
			if (S_ISDIR(st.st_mode)) data->attrib |= _A_SUBDIR;
		}
		return 0;
	}
	return -1;
}

static inline int _findclose(long h)
{
	if (h == -1)
		return -1;
	struct _find_ctx *ctx = (struct _find_ctx *)(intptr_t)h;
	if (!ctx) return -1;
	if (ctx->dir) closedir(ctx->dir);
	free(ctx);
	return 0;
}

static inline int _access(const char *p, int m) { return access(p, m); }
static inline int _chmod(const char *p, int m) { return chmod(p, (mode_t)m); }

#ifdef __cplusplus
}
#endif

#endif

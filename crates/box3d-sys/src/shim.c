// C parts of the tiny libc for wasm32-unknown-unknown (variadics cannot be written in stable Rust).
// Printing, files and logging are no-ops. qsort is a heap sort: no recursion, no allocation, same order every run.
#include <stddef.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

FILE* stdout = 0;
FILE* stderr = 0;

int printf(const char* fmt, ...) { (void)fmt; return 0; }
int fprintf(FILE* f, const char* fmt, ...) { (void)f; (void)fmt; return 0; }
int puts(const char* s) { (void)s; return 0; }
int fscanf(FILE* f, const char* fmt, ...) { (void)f; (void)fmt; return -1; }

// Only used for names and diagnostics: write an empty string.
int vsnprintf(char* buf, size_t n, const char* fmt, va_list ap) {
    (void)fmt; (void)ap;
    if (n > 0) buf[0] = 0;
    return 0;
}
int snprintf(char* buf, size_t n, const char* fmt, ...) {
    (void)fmt;
    if (n > 0) buf[0] = 0;
    return 0;
}

FILE* fopen(const char* path, const char* mode) { (void)path; (void)mode; return 0; }
int fclose(FILE* f) { (void)f; return -1; }
size_t fread(void* p, size_t size, size_t n, FILE* f) { (void)p; (void)size; (void)n; (void)f; return 0; }
size_t fwrite(const void* p, size_t size, size_t n, FILE* f) { (void)p; (void)size; (void)n; (void)f; return 0; }
int fseek(FILE* f, long off, int whence) { (void)f; (void)off; (void)whence; return -1; }
long ftell(FILE* f) { (void)f; return -1; }

float remainderf(float x, float y) { return x - y * __builtin_rintf(x / y); }

int strcmp(const char* a, const char* b) {
    while (*a && *a == *b) { ++a; ++b; }
    return (unsigned char)*a - (unsigned char)*b;
}
char* strncpy(char* d, const char* s, size_t n) {
    size_t i = 0;
    for (; i < n && s[i]; ++i) d[i] = s[i];
    for (; i < n; ++i) d[i] = 0;
    return d;
}

static void swapBytes(char* a, char* b, size_t size) {
    while (size--) { char t = *a; *a++ = *b; *b++ = t; }
}

static void siftDown(char* base, size_t size, size_t start, size_t end, int (*cmp)(const void*, const void*)) {
    size_t root = start;
    while (2 * root + 1 < end) {
        size_t child = 2 * root + 1;
        if (child + 1 < end && cmp(base + child * size, base + (child + 1) * size) < 0) child++;
        if (cmp(base + root * size, base + child * size) >= 0) return;
        swapBytes(base + root * size, base + child * size, size);
        root = child;
    }
}

void qsort(void* basev, size_t n, size_t size, int (*cmp)(const void*, const void*)) {
    char* base = (char*)basev;
    if (n < 2) return;
    for (size_t i = n / 2; i-- > 0;) siftDown(base, size, i, n, cmp);
    for (size_t end = n - 1; end > 0; --end) {
        swapBytes(base, base + end * size, size);
        siftDown(base, size, 0, end, cmp);
    }
}

#pragma once
#include <stddef.h>
void* malloc(size_t n);
void* calloc(size_t n, size_t m);
void* realloc(void* p, size_t n);
void free(void* p);
void* aligned_alloc(size_t align, size_t n);
void qsort(void* base, size_t n, size_t size, int (*cmp)(const void*, const void*));
static inline int abs(int x) { return x < 0 ? -x : x; }

// Printing and files do nothing here: a game engine in a browser has neither stdout nor a disk.
#pragma once
#include <stddef.h>
#include <stdarg.h>
typedef struct FILE FILE;
#define EOF (-1)
#define SEEK_SET 0
#define SEEK_END 2
int printf(const char* fmt, ...);
int fprintf(FILE* f, const char* fmt, ...);
int snprintf(char* buf, size_t n, const char* fmt, ...);
int vsnprintf(char* buf, size_t n, const char* fmt, va_list ap);
int puts(const char* s);
FILE* fopen(const char* path, const char* mode);
int fclose(FILE* f);
size_t fread(void* p, size_t size, size_t n, FILE* f);
size_t fwrite(const void* p, size_t size, size_t n, FILE* f);
int fscanf(FILE* f, const char* fmt, ...);
int fseek(FILE* f, long off, int whence);
long ftell(FILE* f);
extern FILE* stdout;
extern FILE* stderr;

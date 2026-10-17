#pragma once
#define sqrtf __builtin_sqrtf
#define fabsf __builtin_fabsf
#define floorf __builtin_floorf
#define ceilf __builtin_ceilf
#define roundf __builtin_roundf
#define truncf __builtin_truncf
#define copysignf __builtin_copysignf
#define fminf __builtin_fminf
#define fmaxf __builtin_fmaxf
#define sinf __builtin_sinf
#define cosf __builtin_cosf
#define sqrt __builtin_sqrt
#define fabs __builtin_fabs
#define floor __builtin_floor
#define ceil __builtin_ceil
float atan2f(float y, float x);
float acosf(float x);
float asinf(float x);
float tanf(float x);
float atanf(float x);
float fmodf(float x, float y);
float remainderf(float x, float y);
float powf(float x, float y);
float expf(float x);
float logf(float x);
#define INFINITY __builtin_inff()
#define NAN __builtin_nanf("")
#define isnan(x) __builtin_isnan(x)
#define isinf(x) __builtin_isinf(x)
#define isfinite(x) __builtin_isfinite(x)
#define M_PI 3.14159265358979323846

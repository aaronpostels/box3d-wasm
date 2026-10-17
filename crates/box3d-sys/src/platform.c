// Real locks for Box3D on wasm32-unknown-unknown with threads. Box3D own fallback for an unknown platform has mutexes and
// semaphores that do nothing (it assumes one thread); with workers on a thread pool that is a data race. These spin on
// C11 atomics, which compile to wasm atomics when the build has them. build.rs renames the fallback versions in timer.c
// (see the -D flags there) so these take their place.
#include <stdatomic.h>
#include <stdlib.h>
#include "core.h"

struct b3Mutex { atomic_int locked; };
struct b3Semaphore { atomic_int count; };

b3Mutex* b3CreateMutex( void ) {
    b3Mutex* m = b3Alloc( sizeof( b3Mutex ) );
    atomic_init( &m->locked, 0 );
    return m;
}
void b3DestroyMutex( b3Mutex* m ) { b3Free( m, sizeof( b3Mutex ) ); }
void b3LockMutex( b3Mutex* m ) {
    while ( atomic_exchange_explicit( &m->locked, 1, memory_order_acquire ) != 0 ) {
    }
}
void b3UnlockMutex( b3Mutex* m ) { atomic_store_explicit( &m->locked, 0, memory_order_release ); }

b3Semaphore* b3CreateSemaphore( int initCount ) {
    b3Semaphore* s = b3Alloc( sizeof( b3Semaphore ) );
    atomic_init( &s->count, initCount );
    return s;
}
void b3DestroySemaphore( b3Semaphore* s ) { b3Free( s, sizeof( b3Semaphore ) ); }
void b3WaitSemaphore( b3Semaphore* s ) {
    for ( ;; ) {
        int c = atomic_load_explicit( &s->count, memory_order_acquire );
        if ( c > 0 && atomic_compare_exchange_weak_explicit( &s->count, &c, c - 1, memory_order_acquire, memory_order_relaxed ) ) return;
    }
}
void b3SignalSemaphore( b3Semaphore* s ) { atomic_fetch_add_explicit( &s->count, 1, memory_order_release ); }

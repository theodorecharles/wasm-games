/* Classic iostream.h for gcc when _MSC_VER is unset. */
#ifndef PORT_IOSTREAM_H
#define PORT_IOSTREAM_H
#include <iostream>
using namespace std;
/* Classic iostreams had ios::nocreate (do not create a missing file). */
#ifndef nocreate
#define nocreate openmode(0)
#endif
#endif

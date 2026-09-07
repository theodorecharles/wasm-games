; Record the BIOS ASCII/scancode pairs a real DOS program receives.
bits 16
org 100h
%ifndef KEY_COUNT
%define KEY_COUNT 8
%endif

    mov ah, 3ch
    xor cx, cx
    mov dx, filename
    int 21h
    mov bx, ax
    mov si, KEY_COUNT

read_key:
    xor ah, ah
    int 16h
    mov [key], ax
    mov ah, 40h
    mov cx, 2
    mov dx, key
    int 21h
    dec si
    jnz read_key
    mov ah, 3eh
    int 21h
    jmp $

filename: db 'KEYS.BIN', 0
key: dw 0

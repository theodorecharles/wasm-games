; Sample real INT 33h cursor coordinates/buttons after each Enter key.
bits 16
org 100h

    mov ax, 0012h
    int 10h
    xor ax, ax
    int 33h
    mov ax, 1
    int 33h
    mov ax, 7
    xor cx, cx
    mov dx, 639
    int 33h
    mov ax, 8
    xor cx, cx
    mov dx, 479
    int 33h
    mov ax, 4
    xor cx, cx
    xor dx, dx
    int 33h

    mov ah, 3ch
    xor cx, cx
    mov dx, filename
    int 21h
    mov bp, ax
    mov si, 5

sample:
    xor ah, ah
    int 16h
    mov ax, 3
    int 33h
    mov [record], bx
    mov [record + 2], cx
    mov [record + 4], dx
    mov bx, bp
    mov ah, 40h
    mov cx, 6
    mov dx, record
    int 21h
    dec si
    jnz sample
    mov ah, 3eh
    int 21h
    jmp $

filename: db 'MOUSE.BIN', 0
record: times 3 dw 0

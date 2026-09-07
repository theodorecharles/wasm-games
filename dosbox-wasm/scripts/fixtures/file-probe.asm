; Real DOS create/write/seek/backpatch/close/reopen regression. No game data.
bits 16
org 100h

    mov ah, 3ch
    xor cx, cx
    mov dx, filename
    int 21h
    jc failed
    mov bx, ax
    mov ah, 40h
    mov cx, 8
    mov dx, header
    int 21h
    jc failed
    cmp ax, 8
    jne failed
    mov si, 3
.block:
    mov ah, 40h
    mov cx, 30000
    mov dx, payload
    int 21h
    jc failed
    cmp ax, 30000
    jne failed
    dec si
    jnz .block

    mov ax, 4201h
    xor cx, cx
    xor dx, dx
    int 21h
    jc failed
    cmp dx, 1
    jne failed
    cmp ax, 24472 ; 90008 - 65536
    jne failed

    mov ax, 4200h
    xor cx, cx
    mov dx, 4
    int 21h
    jc failed
    cmp ax, 4
    jne failed
    or dx, dx
    jnz failed
    mov ah, 40h
    mov cx, 4
    mov dx, length_be
    int 21h
    jc failed
    cmp ax, 4
    jne failed
    mov ah, 3eh
    int 21h
    jc failed

    mov ax, 3d00h
    mov dx, filename
    int 21h
    jc failed
    mov bx, ax
    mov ah, 3fh
    mov cx, 8
    mov dx, readback
    int 21h
    jc failed
    cmp ax, 8
    jne failed
    mov ah, 3eh
    int 21h
    jc failed
    mov byte [result], 1
    jmp report
failed:
    mov byte [result], 0
report:
    mov ah, 3ch
    xor cx, cx
    mov dx, result_name
    int 21h
    mov bx, ax
    mov ah, 40h
    mov cx, 9
    mov dx, result
    int 21h
    mov ah, 3eh
    int 21h
    ; Separately observe an open guest file's buffered header update. This is
    ; not a completed-save oracle: the guest has not closed this file.
    mov ah, 3ch
    xor cx, cx
    mov dx, open_name
    int 21h
    mov bx, ax
    mov ah, 40h
    mov cx, 8
    mov dx, header
    int 21h
    mov ax, 4200h
    xor cx, cx
    mov dx, 4
    int 21h
    mov ah, 40h
    mov cx, 4
    mov dx, length_be
    int 21h
    jmp $

filename: db 'FILE.BIN', 0
result_name: db 'RESULT.BIN', 0
open_name: db 'OPEN.BIN', 0
header: db 'FORM', 0, 0, 0, 0
length_be: db 0, 1, 05fh, 090h ; 90000 in big endian
result: db 0
readback: times 8 db 0
payload: times 30000 db 05ah

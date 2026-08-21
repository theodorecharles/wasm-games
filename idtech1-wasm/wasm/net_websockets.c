//
// Copyright(C) 2021 Cloudflare, Inc.
// Copyright(C) 2026 id Tech 1 WASM contributors
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.
//
// Browser WebSocket transport for the Chocolate Doom network protocol.
// The framing is compatible with Cloudflare's doom-wasm router: outbound
// datagrams contain little-endian destination/source IDs followed by the
// native packet; inbound datagrams contain the source ID and packet.
//

#include <emscripten.h>
#include <emscripten/websocket.h>

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "doomtype.h"
#include "m_argv.h"
#include "m_misc.h"
#include "net_defs.h"
#include "net_packet.h"
#include "net_websockets.h"

#define MAX_QUEUE_SIZE 256
#define SERVER_ID 1U

typedef struct
{
    net_packet_t *packet;
    uint32_t from;
} queued_packet_t;

static queued_packet_t queue[MAX_QUEUE_SIZE];
static unsigned int queue_head;
static unsigned int queue_tail;
static EMSCRIPTEN_WEBSOCKET_T websocket;
static boolean connected;
static boolean connecting;
static uint32_t instance_id;
static uint32_t server_handle = SERVER_ID;
static net_addr_t server_address;

static void WriteU32(byte *destination, uint32_t value)
{
    destination[0] = (byte) (value & 0xffU);
    destination[1] = (byte) ((value >> 8) & 0xffU);
    destination[2] = (byte) ((value >> 16) & 0xffU);
    destination[3] = (byte) ((value >> 24) & 0xffU);
}

static uint32_t ReadU32(const byte *source)
{
    return (uint32_t) source[0]
         | (uint32_t) source[1] << 8
         | (uint32_t) source[2] << 16
         | (uint32_t) source[3] << 24;
}

static void ClearQueue(void)
{
    while (queue_head != queue_tail)
    {
        NET_FreePacket(queue[queue_head].packet);
        queue_head = (queue_head + 1U) % MAX_QUEUE_SIZE;
    }
}

static EM_BOOL OnOpen(int event_type,
                      const EmscriptenWebSocketOpenEvent *event,
                      void *user_data)
{
    (void) event_type;
    (void) event;
    (void) user_data;
    connected = true;
    connecting = false;
    printf("[crispy-wasm] multiplayer WebSocket connected\n");
    return EM_TRUE;
}

static EM_BOOL OnClose(int event_type,
                       const EmscriptenWebSocketCloseEvent *event,
                       void *user_data)
{
    (void) event_type;
    (void) user_data;
    connected = false;
    connecting = false;
    printf("[crispy-wasm] multiplayer WebSocket closed (%u)\n",
           (unsigned int) event->code);
    return EM_TRUE;
}

static EM_BOOL OnError(int event_type,
                       const EmscriptenWebSocketErrorEvent *event,
                       void *user_data)
{
    (void) event_type;
    (void) event;
    (void) user_data;
    connected = false;
    connecting = false;
    fprintf(stderr, "[crispy-wasm] multiplayer WebSocket failed\n");
    return EM_TRUE;
}

static EM_BOOL OnMessage(int event_type,
                         const EmscriptenWebSocketMessageEvent *event,
                         void *user_data)
{
    unsigned int next_tail;
    net_packet_t *packet;

    (void) event_type;
    (void) user_data;

    if (event->isText || event->numBytes <= 4)
    {
        return EM_TRUE;
    }

    next_tail = (queue_tail + 1U) % MAX_QUEUE_SIZE;
    if (next_tail == queue_head)
    {
        fprintf(stderr, "[crispy-wasm] multiplayer receive queue full\n");
        return EM_TRUE;
    }

    packet = NET_NewPacket(event->numBytes - 4U);
    memcpy(packet->data, event->data + 4, event->numBytes - 4U);
    packet->len = event->numBytes - 4U;
    queue[queue_tail].packet = packet;
    queue[queue_tail].from = ReadU32(event->data);
    queue_tail = next_tail;
    return EM_TRUE;
}

static boolean InitWebSocket(void)
{
    EmscriptenWebSocketCreateAttributes attributes;
    uint16_t ready_state = 0;
    int parameter;
    int waited_ms = 0;

    if (connected)
    {
        return true;
    }

    parameter = M_CheckParmWithArgs("-wss", 1);
    if (parameter <= 0)
    {
        fprintf(stderr, "[crispy-wasm] -wss requires a WebSocket URL\n");
        return false;
    }

    printf("[crispy-wasm] opening multiplayer WebSocket %s\n", myargv[parameter + 1]);

    if (!connecting)
    {
        emscripten_websocket_init_create_attributes(&attributes);
        attributes.url = myargv[parameter + 1];
        attributes.createOnMainThread = EM_TRUE;
        websocket = emscripten_websocket_new(&attributes);
        printf("[crispy-wasm] multiplayer WebSocket handle=%d\n", (int) websocket);
        if (websocket <= 0)
        {
            return false;
        }
        connecting = true;
        emscripten_websocket_set_onopen_callback(websocket, NULL, OnOpen);
        emscripten_websocket_set_onclose_callback(websocket, NULL, OnClose);
        emscripten_websocket_set_onerror_callback(websocket, NULL, OnError);
        emscripten_websocket_set_onmessage_callback(websocket, NULL, OnMessage);
    }

    while (waited_ms < 15000)
    {
        if (emscripten_websocket_get_ready_state(websocket, &ready_state)
            != EMSCRIPTEN_RESULT_SUCCESS)
        {
            break;
        }
        if (ready_state == 1)
        {
            connected = true;
            connecting = false;
            return true;
        }
        if (ready_state > 1)
        {
            break;
        }
        emscripten_sleep(25);
        waited_ms += 25;
    }

    connecting = false;
    return false;
}

static boolean NET_WebSockets_InitClient(void)
{
    printf("[crispy-wasm] initializing Chocolate-compatible network client\n");
    if (!InitWebSocket())
    {
        return false;
    }

    ClearQueue();
    queue_head = queue_tail = 0;
    if (instance_id == 0 || instance_id == SERVER_ID)
    {
        instance_id = ((uint32_t) rand() % 0xfffdU) + 2U;
    }
    server_address.module = &net_websockets_module;
    server_address.refcount = 0;
    server_address.handle = &server_handle;
    return true;
}

static boolean NET_WebSockets_InitServer(void)
{
    return false;
}

static void NET_WebSockets_SendPacket(net_addr_t *address, net_packet_t *packet)
{
    byte *framed;
    uint32_t destination;

    if (!connected || address == NULL || address->handle == NULL)
    {
        return;
    }

    destination = *(uint32_t *) address->handle;
    framed = malloc(packet->len + 8U);
    if (framed == NULL)
    {
        return;
    }
    WriteU32(framed, destination);
    WriteU32(framed + 4, instance_id);
    memcpy(framed + 8, packet->data, packet->len);
    if (emscripten_websocket_send_binary(websocket, framed, packet->len + 8U)
        != EMSCRIPTEN_RESULT_SUCCESS)
    {
        connected = false;
    }
    free(framed);
}

static boolean NET_WebSockets_RecvPacket(net_addr_t **address,
                                         net_packet_t **packet)
{
    queued_packet_t value;

    if (queue_head == queue_tail)
    {
        return false;
    }
    value = queue[queue_head];
    queue_head = (queue_head + 1U) % MAX_QUEUE_SIZE;
    server_handle = value.from;
    *address = &server_address;
    *packet = value.packet;
    return true;
}

static void NET_WebSockets_AddrToString(net_addr_t *address,
                                        char *buffer,
                                        int buffer_len)
{
    uint32_t value = address != NULL && address->handle != NULL
                   ? *(uint32_t *) address->handle : 0;
    M_snprintf(buffer, buffer_len, "WebSocket peer %u", (unsigned int) value);
}

static void NET_WebSockets_FreeAddress(net_addr_t *address)
{
    (void) address;
}

static net_addr_t *NET_WebSockets_ResolveAddress(const char *address)
{
    (void) address;
    return &server_address;
}

net_module_t net_websockets_module =
{
    NET_WebSockets_InitClient,
    NET_WebSockets_InitServer,
    NET_WebSockets_SendPacket,
    NET_WebSockets_RecvPacket,
    NET_WebSockets_AddrToString,
    NET_WebSockets_FreeAddress,
    NET_WebSockets_ResolveAddress,
};

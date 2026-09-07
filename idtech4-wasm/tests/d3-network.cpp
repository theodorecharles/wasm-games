#include <cassert>
#include <cstring>
#include <cstdio>
#include <emscripten.h>
#include "d3-network-production.h"

static int cases = 0;
#define CHECK(condition) do { assert(condition); ++cases; } while (0)

int main() {
	idPort port;
	CHECK(!port.InitForPort(PORT_ANY)); // SP / unconfigured worker stays offline
	CHECK(port.GetPort() == 0);
	EM_ASM({ setupD3NetworkFixture(); });
	CHECK(!port.InitForPort(27666)); // no browser listen server
	CHECK(port.InitForPort(PORT_ANY));
	CHECK(port.GetPort() == 27667);
	idPort other;
	CHECK(!other.InitForPort(PORT_ANY));
	netadr_t address = {NA_LOOPBACK, {127, 0, 0, 1}, 27666};
	unsigned char data[4] = {255, 0, 17, 2};
	port.SendPacket(address, data, sizeof(data));
	CHECK(EM_ASM_INT({ return fixtureSocket.sent.length; }) == 1);
	CHECK(EM_ASM_INT({ return fixtureSocket.sent[0][0]; }) == 255);
	data[0] = 0;
	CHECK(EM_ASM_INT({ return fixtureSocket.sent[0][0]; }) == 255);
	address.type = NA_IP;
	port.SendPacket(address, data, sizeof(data));
	CHECK(EM_ASM_INT({ return fixtureSocket.sent.length; }) == 2);
	address.ip[0] = 8;
	port.SendPacket(address, data, sizeof(data));
	address.ip[0] = 127;
	address.port = 1;
	port.SendPacket(address, data, sizeof(data));
	address.port = 27666;
	address.type = NA_BROADCAST;
	port.SendPacket(address, data, sizeof(data));
	address.type = NA_LOOPBACK;
	port.SendPacket(address, nullptr, 4);
	port.SendPacket(address, data, -1);
	port.SendPacket(address, data, 65508);
	CHECK(EM_ASM_INT({ return fixtureSocket.sent.length; }) == 2);
	netadr_t from = {};
	int size = 99;
	CHECK(!port.GetPacket(from, data, size, sizeof(data)));
	CHECK(size == 99);
	EM_ASM({ fixtureSocket.onmessage({data: new Uint8Array([255, 0, 9, 4]).buffer}); });
	CHECK(!port.GetPacket(from, nullptr, size, sizeof(data)));
	CHECK(!port.GetPacket(from, data, size, -1));
	CHECK(port.GetPacket(from, data, size, sizeof(data)));
	CHECK(size == 4 && data[0] == 255 && data[1] == 0 && data[2] == 9 && data[3] == 4);
	CHECK(from.type == NA_LOOPBACK && from.port == 27666);
	CHECK(from.ip[0] == 127 && from.ip[1] == 0 && from.ip[2] == 0 && from.ip[3] == 1);
	EM_ASM({ fixtureSocket.onmessage({data: new Uint8Array([1, 2, 3, 4, 5]).buffer}); });
	CHECK(!port.GetPacket(from, data, size, sizeof(data)));
	CHECK(data[0] == 255); // never truncated
	EM_ASM({ setTimeout(() => fixtureSocket.onmessage({data: new Uint8Array([3]).buffer}), 1); });
	CHECK(!port.GetPacketBlocking(from, data, size, sizeof(data), 0));
	CHECK(port.GetPacketBlocking(from, data, size, sizeof(data), 10));
	CHECK(size == 1 && data[0] == 3); // actual Asyncify event-loop delivery
	CHECK(!port.GetPacketBlocking(from, data, size, sizeof(data), -1));
	port.Close();
	CHECK(port.GetPort() == 0);
	CHECK(!port.GetPacketBlocking(from, data, size, sizeof(data), 10));
	CHECK(port.InitForPort(PORT_ANY));
	CHECK(EM_ASM_INT({ return fixtureSocket.sent.length; }) == 0);
	CHECK(!port.GetPacket(from, data, size, sizeof(data)));
	port.Close();
	std::printf("{\"cases\":%d,\"passed\":true}\n", cases);
}

/*
    Open1560 - An Open Source Re-Implementation of Midtown Madness 1 Beta
    Copyright (C) 2020 Brick

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
    GNU General Public License for more details.
*/

#include "stream/ares_format.h"

#include <cstddef>
#include <cstring>
#include <limits>
#include <string>

namespace
{
constexpr usize HeaderSize = sizeof(AresHeader);
constexpr usize NodeSize = sizeof(VirtualFileInode);
constexpr usize RootPreviewLimit = 64;

std::string result;

template <typename T>
bool ReadValue(const u8* bytes, usize size, usize offset, T& value)
{
    if (offset > size || sizeof(T) > size - offset)
        return false;

    std::memcpy(&value, bytes + offset, sizeof(T));
    return true;
}

void AppendJsonString(std::string& output, const std::string& value)
{
    static constexpr char Hex[] = "0123456789abcdef";

    output += '"';
    for (unsigned char c : value)
    {
        switch (c)
        {
            case '"': output += "\\\""; break;
            case '\\': output += "\\\\"; break;
            case '\b': output += "\\b"; break;
            case '\f': output += "\\f"; break;
            case '\n': output += "\\n"; break;
            case '\r': output += "\\r"; break;
            case '\t': output += "\\t"; break;
            default:
                if (c < 0x20)
                {
                    output += "\\u00";
                    output += Hex[c >> 4];
                    output += Hex[c & 0xF];
                }
                else
                {
                    output += static_cast<char>(c);
                }
        }
    }
    output += '"';
}

const char* Fail(const char* message)
{
    result = "{\"valid\":false,\"error\":";
    AppendJsonString(result, message);
    result += '}';
    return result.c_str();
}

bool AddWouldOverflow(usize lhs, usize rhs)
{
    return rhs > std::numeric_limits<usize>::max() - lhs;
}

bool MulWouldOverflow(usize lhs, usize rhs)
{
    return lhs != 0 && rhs > std::numeric_limits<usize>::max() / lhs;
}

bool NameAt(const u8* names, usize names_size, u32 offset, const VirtualFileInode& node, std::string& output)
{
    if (offset >= names_size)
        return false;

    const u8* cursor = names + offset;
    const u8* end = names + names_size;
    while (cursor != end && *cursor != 0)
    {
        if (*cursor == 1)
        {
            output += std::to_string(node.GetNameInteger());
        }
        else
        {
            output += static_cast<char>(*cursor);
        }
        ++cursor;
    }

    return cursor != end;
}

bool ExpandName(
    const u8* names, usize names_size, const VirtualFileInode& node, std::string& output)
{
    if (!NameAt(names, names_size, node.GetNameOffset(), node, output))
        return false;

    if (u32 ext_offset = node.GetExtOffset())
    {
        output += '.';
        if (!NameAt(names, names_size, ext_offset, node, output))
            return false;
    }

    return true;
}
} // namespace

extern "C" const char* mm1_probe_archive(const u8* bytes, usize size)
{
    if (bytes == nullptr)
        return Fail("No archive bytes were supplied");

    AresHeader header {};
    if (!ReadValue(bytes, size, 0, header))
        return Fail("File is smaller than an AngelRes header");

    if (header.Magic != AresMagic)
        return Fail("Magic is not ARES");

    const usize node_count = header.NodeCount;
    if (MulWouldOverflow(node_count, NodeSize))
        return Fail("Node table size overflows address space");

    const usize nodes_size = node_count * NodeSize;
    if (AddWouldOverflow(HeaderSize, nodes_size))
        return Fail("Node table end overflows address space");

    const usize names_offset = HeaderSize + nodes_size;
    const usize names_size = header.NamesSize;
    if (names_offset > size || names_size > size - names_offset)
        return Fail("Node or name table extends beyond the file");

    if (header.RootCount > header.NodeCount)
        return Fail("Root count is larger than node count");

    const u8* names = bytes + names_offset;
    std::string roots_json;
    roots_json += '[';

    for (usize i = 0; i < node_count; ++i)
    {
        VirtualFileInode node {};
        if (!ReadValue(bytes, size, HeaderSize + i * NodeSize, node))
            return Fail("Node table is truncated");

        std::string name;
        if (!ExpandName(names, names_size, node, name))
            return Fail("A node name is outside or unterminated in the name table");

        if (node.IsDirectory())
        {
            const usize first = node.GetEntryIndex();
            const usize count = node.GetEntryCount();
            if (first > node_count || count > node_count - first)
                return Fail("A directory child range is outside the node table");
        }
        else
        {
            const usize offset = node.GetOffset();
            const usize entry_size = node.GetSize();
            if (entry_size == 0x4DCDCD || offset > size || entry_size > size - offset)
                return Fail("A file payload is outside the archive");
        }

        if (i < header.RootCount && i < RootPreviewLimit)
        {
            if (i != 0)
                roots_json += ',';
            roots_json += "{\"name\":";
            AppendJsonString(roots_json, name);
            roots_json += ",\"kind\":\"";
            roots_json += node.IsDirectory() ? "directory" : "file";
            roots_json += "\",\"size\":";
            roots_json += std::to_string(node.IsDirectory() ? node.GetEntryCount() : node.GetSize());
            roots_json += '}';
        }
    }

    roots_json += ']';

    result = "{\"valid\":true,\"format\":\"AngelRes\",\"archiveBytes\":";
    result += std::to_string(size);
    result += ",\"nodeCount\":";
    result += std::to_string(header.NodeCount);
    result += ",\"rootCount\":";
    result += std::to_string(header.RootCount);
    result += ",\"namesBytes\":";
    result += std::to_string(header.NamesSize);
    result += ",\"rootsTruncated\":";
    result += header.RootCount > RootPreviewLimit ? "true" : "false";
    result += ",\"roots\":";
    result += roots_json;
    result += '}';
    return result.c_str();
}

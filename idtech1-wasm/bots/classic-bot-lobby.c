// SPDX-License-Identifier: GPL-2.0-or-later
// Native lobby policy only; NET_CL_LaunchGame is the same action as Space.
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include "m_argv.h"
#include "net_client.h"
#include "i_timer.h"

static int in_lobby, grace_ms, timer_started, launch_sent, previous_players = -1;
static uint32_t first_human_at, next_report;

void __real_TXT_Sleep(unsigned int timeout);
void __wrap_TXT_Sleep(unsigned int timeout)
{
    uint32_t now = (uint32_t)I_GetTimeMS();
    if (in_lobby && net_client_received_wait_data) {
        int players = net_client_wait_data.num_players;
        int remaining = -1;
        if (grace_ms > 0 && net_client_wait_data.is_controller && !launch_sent) {
            if (players < 3) timer_started = 0;
            else {
                if (!timer_started) { first_human_at = now; timer_started = 1; }
                remaining = grace_ms - (int)(now - first_human_at);
                if (remaining <= 0) {
                    remaining = 0;
                    launch_sent = 1;
                    NET_CL_LaunchGame();
                }
            }
        }
        if (players != previous_players || now >= next_report || launch_sent == 1) {
            fprintf(stderr, "[classic-bot] {\"event\":\"lobby-state\",\"slot\":%d,\"players\":%d,\"capacity\":%d,\"controller\":%d,\"remainingMs\":%d}\n",
                net_client_wait_data.consoleplayer, players,
                net_client_wait_data.max_players, net_client_wait_data.is_controller, remaining);
            fflush(stderr);
            previous_players = players; next_report = now + 1000;
            if (launch_sent == 1) launch_sent = 2;
        }
    }
    __real_TXT_Sleep(timeout);
}

void __real_NET_WaitForLaunch(void);
void __wrap_NET_WaitForLaunch(void)
{
    int arg = M_CheckParmWithArgs("-bot-lobby-grace-ms", 1);
    if (arg) {
        char *end;
        long value = strtol(myargv[arg + 1], &end, 10);
        if (*end || value < 100 || value > 60000) {
            fprintf(stderr, "Invalid bot lobby grace (100..60000 ms)\n");
            exit(2);
        }
        grace_ms = (int)value;
    }
    in_lobby = 1;
    fprintf(stderr, "[classic-bot] {\"event\":\"lobby\"}\n");
    fflush(stderr);
    __real_NET_WaitForLaunch();
    in_lobby = 0;
    fprintf(stderr, "[classic-bot] {\"event\":\"match-started\",\"players\":%d}\n",
        net_client_wait_data.num_players);
    fflush(stderr);
}

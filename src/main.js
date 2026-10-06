/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// Maintenance processes must never acquire the app lock or initialize windows.
// Squirrel quits after its asynchronous shortcut helper completes; do not quit early.
if (!require('electron-squirrel-startup')) {
	require('./bootstrap.js')
}

/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Identify Squirrel's maintenance invocation, not a normal first launch.
 *
 * @param {string[]} argv Process arguments including the executable
 * @return {boolean} Whether this invocation is installer maintenance
 */
function isSquirrelMaintenance(argv) {
	return ['--squirrel-install', '--squirrel-updated', '--squirrel-uninstall', '--squirrel-obsolete'].includes(argv[1])
}

module.exports = { isSquirrelMaintenance }

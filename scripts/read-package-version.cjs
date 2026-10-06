/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const fs = require('node:fs')
const { inflateRawSync } = require('node:zlib')

/**
 * Read the bounded NuGet metadata without extracting executable files.
 *
 * @param {string} filename Full nupkg path
 */
function readPackageVersion(filename) {
	const fd = fs.openSync(filename, 'r')
	try {
		const size = fs.fstatSync(fd).size
		const read = (offset, length) => {
			if (offset < 0 || length < 0 || offset + length > size) {
				throw new Error('Invalid package ZIP bounds')
			}
			const bytes = Buffer.alloc(length)
			if (fs.readSync(fd, bytes, 0, length, offset) !== length) {
				throw new Error('Incomplete package ZIP')
			}
			return bytes
		}
		const tail = read(Math.max(0, size - 65557), Math.min(size, 65557))
		let end = -1
		for (let i = tail.length - 22; i >= 0; i--) {
			if (tail.readUInt32LE(i) === 0x06054b50 && i + 22 + tail.readUInt16LE(i + 20) === tail.length) {
				end = i
				break
			}
		}
		if (end < 0 || tail.readUInt16LE(end + 4) || tail.readUInt16LE(end + 6)) {
			throw new Error('Expected a single-disk NuGet ZIP package')
		}
		const entries = tail.readUInt16LE(end + 10)
		const length = tail.readUInt32LE(end + 12)
		if (entries === 65535 || length > 16 * 1024 * 1024) {
			throw new Error('Unsupported package ZIP directory')
		}
		const directory = read(tail.readUInt32LE(end + 16), length)
		const metadata = []
		let offset = 0
		for (let i = 0; i < entries; i++) {
			if (offset + 46 > directory.length || directory.readUInt32LE(offset) !== 0x02014b50) {
				throw new Error('Invalid package ZIP directory')
			}
			const nameLength = directory.readUInt16LE(offset + 28)
			const next = offset + 46 + nameLength + directory.readUInt16LE(offset + 30) + directory.readUInt16LE(offset + 32)
			if (next > directory.length) {
				throw new Error('Invalid package ZIP entry')
			}
			const name = directory.toString('utf8', offset + 46, offset + 46 + nameLength)
			if (/^[^/\\]+\.nuspec$/i.test(name)) {
				const compressedSize = directory.readUInt32LE(offset + 20)
				const method = directory.readUInt16LE(offset + 10)
				if (compressedSize > 1024 * 1024 || directory.readUInt16LE(offset + 8) & 1) {
					throw new Error('Invalid package metadata')
				}
				const localOffset = directory.readUInt32LE(offset + 42)
				const local = read(localOffset, 30)
				if (local.readUInt32LE(0) !== 0x04034b50) {
					throw new Error('Invalid package local header')
				}
				const bytes = read(localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28), compressedSize)
				if (method !== 0 && method !== 8) {
					throw new Error('Unsupported package compression')
				}
				metadata.push((method === 0 ? bytes : inflateRawSync(bytes, { maxOutputLength: 1024 * 1024 })).toString('utf8'))
			}
			offset = next
		}
		if (metadata.length !== 1 || /<!DOCTYPE|<!ENTITY/i.test(metadata[0])) {
			throw new Error('Expected exactly one safe package nuspec')
		}
		const versions = [...metadata[0].matchAll(/<version>\s*([^<]+?)\s*<\/version>/g)]
		if (versions.length !== 1) {
			throw new Error('Missing or ambiguous embedded package version')
		}
		return versions[0][1]
	} finally {
		fs.closeSync(fd)
	}
}
module.exports = { readPackageVersion }

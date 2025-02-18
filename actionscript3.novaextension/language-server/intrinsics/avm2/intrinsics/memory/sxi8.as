/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
package avm2.intrinsics.memory
{
	/**
	 * Sign extend a <code>8 bit</code> value to <code>32 bits</code>.
	 *
	 * <p>
	 * Convert value to integer using the equivalent of <code>convert_i</code>,
	 * then copy bit 7 to bits 8-31.
	 * </p>
	 *
	 * <p>
	 * The result is a signed 32-bit integer.
	 * </p>
	 *
	 * <p>
	 * opcode <b>sxi8</b> = <code>81</code> (<code>0x51</code>).
	 * </p>
	 *
	 * @langversion 3.0
	 * @playerversion Flash 11.6
	 * @playerversion AIR 11.6
	 */
	public native function sxi8(value:int):int;
}
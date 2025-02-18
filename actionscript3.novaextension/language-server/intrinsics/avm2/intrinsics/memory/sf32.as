/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
package avm2.intrinsics.memory
{
	/**
	 * Store 32 bit <code>float</code>.
	 *
	 * <p>
	 * Store a 32 bit (IEEE 754) float to global memory.
	 * </p>
	 *
	 * <p>
	 * The input value is converted to Number using the equivalent of <code>convert_d</code>,
	 * truncated to 32-bit float, then stored as four bytes in little-endian order.
	 * </p>
	 *
	 * <p>
	 * The MOPS opcodes all access the backing store of the ByteArray represented
	 * by the current app domain's <code>ApplicationDomain.domainMemory</code> property.
	 * </p>
	 *
	 * <p>
	 * Address ranges for accesses will be range checked using standard comparisons.
	 * </p>
	 *
	 * <p>
	 * opcode <b>sf32</b> = <code>61</code> (<code>0x3D</code>).
	 * </p>
	 *
	 * @langversion 3.0
	 * @playerversion Flash 11.6
	 * @playerversion AIR 11.6
	 *
	 * @throws RangeError Range check failures will result in an <code>InvalidRangeError</code> exception.
	 */
	public native function sf32(value:Number, addr:int):void;
}
/*
 * Copyright (c) 2012 Agency Republic
 * 
 * Permission is hereby granted to use, modify, and distribute this file 
 * in accordance with the terms of the license agreement accompanying it.
 */
package com.agencyrepublic.template.events
{
    import flash.events.Event;

    /**
     * Sample custom event class.
     * 
     * @author tomasz.szarzynski
     * 
     * @see Event
     */
    public class SampleEvent extends Event
    {
        public static var SOMETHING_HAPPENED : String = "SampleEvent.SOMETHING_HAPPENED";

	/**
	 * Constructor.
	 */
        public function SampleEvent( type : String, bubbles : Boolean = false, cancelable : Boolean = false )
        {
            super( type, bubbles, cancelable );
        }


        override public function clone() : Event
        {
            return new SampleEvent( this.type, this.bubbles, this.cancelable );
        }
    }
}

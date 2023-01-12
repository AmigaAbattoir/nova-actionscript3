/*
 * Copyright (c) 2012 Agency Republic
 * 
 * Permission is hereby granted to use, modify, and distribute this file 
 * in accordance with the terms of the license agreement accompanying it.
 */
package com.agencyrepublic.template
{
    import com.agencyrepublic.template.events.SampleEvent;

    import flash.display.SimpleButton;
    import flash.display.Sprite;
    import flash.events.Event;
    import flash.events.MouseEvent;

    /**
     * Lightweight AS3 coding standard example class
     * 
     * You can use the following structure as an example:
     * 
     * 1. Initial comment. (Author, version, copyright, code license, and so on)
     * 2. Package declaration
     * 3. Import statements
     * 4. Class or interface implementation ASDoc comment
     * 5. Class-level metadata tags: Event, Style, Effect
     * 6. Class or interface statement
     * 7. Static variables
     * 8. Instance variables 
     * 9. Constructor
     * 10. Methods, grouped according to functionality
     * 11. Getter/setter methods (with backing variables)
     * 
     * General code formating guidelines:
     * 
     *  - Use spaces to improve code readability
     *  - Separate each method in a class with a blank line
     *  - Indent each new block of code by four spaces
     *  - Use blank spaces to separate keywords from parentheses
     *  - Do not use spaces to separate method names from parentheses
     *  - Name the arguments of event handlers "event"
     *  - Specify types for method arguments
     *  - Always use an access modifier for method signatures
     *  - Always provide a return type even if it is void (returns nothing) or * (any type)
     *  - Comment each method using ASDoc style comments
     *  - Place the getter method above the setter method
     *  - Group methods in a class by functionality
     *  - Limit code to one statement per line
     *  - Include a verb in method names
     *  - Prefix variables with underscores for getter/setters
     *  - Match constant string variable names to their contents
     *  - Capitalize constants
     *  - Prefix Boolean variable names with "can", "is", or "has"
     *  - Always strongly type your variables
     *  - One variable declaration per line of source code
     *  - Use meaningful and descriptive variable names
     *  - Use blank lines in between methods
     *  - Append class types (formatter, validator, event, and error) to the class name
     *  - Match instance variables to arguments
     *  - Name packages according to the classes they contain
     *  - Use plural names for packages
     *  
     *  @author tomasz.szarzynski
     *  @version 1.0
     */
    [Event(name="SampleEvent.SOMETHING_HAPPENED", type="com.agencyrepublic.template.events.SampleEvent")]
    public class SampleClass extends Sprite implements ISampleInterface
    {
        // ---------------------------------------------------------------------
        // Constants
        // ---------------------------------------------------------------------
        public static const SOME_CONSTANT_NUMBER : int = 10;
        // ---------------------------------------------------------------------
        // Variables
        // ---------------------------------------------------------------------
        // display objects
        public var someBtn : SimpleButton;
        // flags
        public var canDoSomething : Boolean = false;
        public var hasDoneSomething : Boolean = false;
        public var isInitialized : Boolean = false;
        /**
         * Some name.
         * 
         * @private
         */
        protected var name : String = "";
        /**
         * Some items array.
         * 
         * @private
         */
        private var _itemsList : Array;


        // ---------------------------------------------------------------------
        // Constructor
        // ---------------------------------------------------------------------
        /**
         * Constructor. Creates a class instance.
         * 
         * @param name Some name
         */
        public function SampleClass( name : String )
        {
            this.name = name;

            this.addEventListener( Event.ADDED_TO_STAGE, this.onAddedToStage );
        }


        // ---------------------------------------------------------------------
        // API
        // ---------------------------------------------------------------------
        /**
         * ISmapleInterface implementation.
         * 
         * @see ISampleInterface
         */
        public function doSomething() : void
        {
            if (this.canDoSomething)
            {
                if (!this.hasDoneSomething)
                {
                    for (var i : int = 0; i < 10; i++)
                    {
                        this.averageNumbers( i, SampleClass.SOME_CONSTANT_NUMBER );
                    }

                    this.hasDoneSomething = true;
                }
            }
            else
            {
                // TODO: implement
            }
        }


        /**
         * Returns average of two numbers.
         * 
         * @param firstNumber First number
         * @param secondNumber Second number
         * 
         * @return Number - average of two numbers.
         */
        public function averageNumbers( firstNumber : Number, secondNumber : Number ) : Number
        {
            // sum of numbers
            var sumOfNumbers : Number = 0;
            // average of numbers
            var average : Number = 0;

            // add numbers
            sumOfNumbers = firstNumber + secondNumber;

            // divide numbers
            average = sumOfNumbers / 2;

            return average;
        }


        /**
         * Hides button.
         */
        public function hideSomeBtn() : void
        {
            if (this.someBtn) this.someBtn.visible = false;
        }


        // ---------------------------------------------------------------------
        // Internal
        // ---------------------------------------------------------------------
        /**
         * Event handler.
         * 
         * @see Event
         */
        private function onAddedToStage( event : Event ) : void
        {
            this.initialize();
        }


        /**
         * Initialize instance.
         * 
         * @private
         */
        protected function initialize() : void
        {
            // create button
            this.someBtn = new SimpleButton();
            this.someBtn.addEventListener( MouseEvent.CLICK, this.someBtn_onClick );
            this.addChild( this.someBtn );

            this.isInitialized = true;
        }


        /**
         * Button click handler.
         * 
         * @private
         */
        private function someBtn_onClick( event : MouseEvent ) : void
        {
            this.notifySomethingHappened();
        }


        /**
         * Dispatches an event.
         * 
         * @private
         */
        private function notifySomethingHappened() : void
        {
            this.dispatchEvent( new SampleEvent( SampleEvent.SOMETHING_HAPPENED ) );
        }


        // ---------------------------------------------------------------------
        // Getters/setters
        // ---------------------------------------------------------------------
        public function get itemsList() : Array
        {
            return this._itemsList;
        }


        public function set itemsList( value : Array ) : void
        {
            this._itemsList = value;
        }
    }
}

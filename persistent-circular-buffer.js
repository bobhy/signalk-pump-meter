const { CircularFile } = require('structured-binary-file');
const CircularBuffer = require('circular-buffer');
const { FixedRecordFile } = require("structured-binary-file");
const { Parser } = require("binary-parser-encoder");


/**
 * Like a @see CircularBuffer, but with a persistent backing file.
 * Supports only append modifications, implements only @see push().
 *
 * Supports all read-only operations, including iteration.
 *
 * Elements of the buffer must be fixed size.
 *
 * Backing file tuned for use in small-ish embedded systems: store binary representation for compactness,
 * sync changes to disk as soon as possible to reduce data loss or corruption by the running system,
 * do small I/O operations for efficiency.
 *
 * Bugs
 * - missing implementations of enqueue, dequeue, pop and shift.
 *
 * Note
 * - could not implement as extension of CircularBuffer, latter invoked my implementations of deq() from super.pop().  Prototype inheritance, not real classes.
 *
 * @author Bob Hyman
 */
module.exports = class PersistentCircularBuffer extends CircularBuffer {


    /**
     * Creates an instance of PersistentCircularBuffer for given objects
     *
     * @param {int} capacity -- Max number of elements to support.  "Oldest" elements will be forgotten to accomodate "newer".
     * @param {*} elementParser -- (@see Parser) for elements to store in the buffer.  All elements must conform to this schema (which implies all elements are same size).
     * @param {*} filePath -- Where to persist the backing store.  This file is created if it doesn't exist, or opened (and checked for consistency) if already exists
     */
    constructor(capacity, elementParser, filePath) {
        //this.buffer = new CircularBuffer(capacity);
        super(capacity);

        this.elementParser = elementParser;
        this.filePath = filePath;

        this.file = new CircularFile(this.elementParser, capacity);
        this.file.open(this.filePath);

        // load in-memory buffer with inital contents of backing file
        //hardwon -- .getNext() returns *null* at end.  This is == undefined, but not === undefined.
        for (var e = this.file.getFirst(); e != undefined; e = this.file.getNext()) {
            super.push(e);
        };
    }

    // would like to simply extend CircularBuffer and
    // defer to its implementation of read-only methods: capacity(), size(), toarray(), get(),
    // but its implementation of pop() would invoke our override of deq()
    //size(){ return this.buffer.size(); }
    //capacity() { return this.buffer.capacity();}

    /**
     * Insert the logically "newest" element into the buffer.
     *
     * Doing this with push rather than enq() means @see toarray() returns oldest element at index 0 and newest element
     * at index @see size() - 1.  This is deemed the "least suprising" order.
     *
     * @param {*} element
     */
    push(element) {
        super.push(element);
        try {
            this.file.appendRecord(element);
        } catch (e) {
            super.pop();  // couldn't persist, remove from in-memory buffer.
            throw e;
        }
    }

    deq(element) {
        throw ("Not yet implemented");
    }

    enq(element) {
        throw ("Not yet implemented");
    }

    pop(element) {
        throw ("Not yet implemented");
    }

    shift() {
        throw ("Not yet implemented");
    }

    /**
     * Close the file representing the backing
     *
     * Required by @see FixedRecordFile, but what happens if you don't close the file?
     * If there's only one object instantiated for the file at any given time, it's hard to see how you get in trouble.
     * @see FixedRecordFile uses synchronous writes in all cases, so it doesn't return control until OS says data was written to disk,
     * and it checks that the correct # of bytes was written and throws if mismatch.
     * A second object could be instantiated, load up current and consistent data and you'd still be fine.
     * So, for example, if your application throws before it can close, and you restart the application, you'll be fine.
     *
     * However, you will definitely have trouble if you have 2 instances both trying to write, maybe on separate threads.
     * If both instances read the current file, they might see, e.g that the next slot is #22.  insance 1 now appends  V1, consuming slot 22 and updating the
     * header on disk to indicate that.  But Insance 2 isn't monitoring for header changes and still thinks it can use slot 22 for its own append, e.g of V2.
     * So now the 2 objects disaggree on what the newest record is and neither saw any error.
     * This object is definitely not thread- or multiprocessing-safe.
     *
     * You should at least try to close the file.
     *
     */
    close() {
        if (this.file) {
            this.file.close();
        }
    }


    /**
     * Check internal consistency, return first error found.
     *
     * @returns {string} -- Some text description of the error, or empty string if none found.
     */
    test_consistency() {

        if (this.file === undefined) { return "backing file not open"; }
        if (this.capacity() != this.file.maxRecordCount) { return `capacity mismatch: file ${this.file.maxRecordCount}, mem ${this.capacity()}` };
        if (this.size() != this.file.recordCount()) { return `current size mismatch: file ${this.file.recordCount()}, mem ${this.size()}` };

        const mem_array = this.toarray();
        var file_element = this.file.getFirst();
        for (var i = 0; i < mem_array.size; i++) {
            mem_element = this.get(i); // also check enumeration order
            if (mem_array[i] != file_element) {
                return `element mismatch at index ${i}, file ${JSON.stringify(file_element)}, from to ${JSON.stringify(mem_array[i])}.`;
            }
            file_element = this.file.getNext();
        }

        return "";  // all OK

    }





}
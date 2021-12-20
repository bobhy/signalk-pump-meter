const { CircularFile } = require('structured-binary-file');
const CircularBuffer = require('circular-buffer');
const { FixedRecordFile } = require("structured-binary-file");
const { Parser } = require("binary-parser-encoder");
const PersistentCircularBuffer = require("../../persistent-circular-buffer");
const { round } = require('lodash');
const tmp = require('tmp');
const { fstat } = require('fs');
const tmpObj = tmp.dirSync();
const fs = require('fs');



/**
 * Create an item and corresponding @see binary-parser-encoder.Parser
 *
 * item can be an object containing strings, ints and floats, but no Objects (yet).
 *
 * @class TestElement
 */
class ParsableObject {

    /**
     * JS object that knows its @see Parser.
     * @param {*} obj -- (usually) an object containing values.
     * values can be primitives or strings but not nested  objects.
     * Current value of strings defines the maximum length of string in the parser.
     * @memberof TestElement
     */
    constructor(obj) {
        this.obj = obj;
        this.parser = new Parser.start();

        for (const [k, v] of Object.entries(obj)) {
            switch (typeof (v)) {
                case 'string':
                    this.parser.string(k, { length: v.length, trim: true });
                    break;
                case 'number':
                    if (round(v) == v) {        //fixme -- better way to ensure test file will always be int?
                        this.parser.int32(k);
                    } else {
                        this.parser.floatbe(k);
                    }
                    break;
                //case 'boolean':
                //    this.parser.bit8(k);        // bit1 apparently botches sizeOf()??
                //    break;
                default:
                    throw `can't create ParsableObject with member of type ${typeof (v)}.`
            }
        }
    }
}

function _test_internal_consistency(pcb) {
    expect(pcb.file instanceof CircularFile).toBeTruthy();
    expect(pcb.capacity()).toEqual(pcb.file.maxRecordCount);
    expect(pcb.size()).toEqual(pcb.file.recordCount());

    const mem_array = pcb.toarray();
    var file_element = pcb.file.getFirst();
    for (var i = 0; i < mem_array.size; i++) {
        mem_element = pcb.get(i); // also check enumeration order
        expect(mem_array[i]).toEqual(file_element);
        expect(mem_array[i]).toEqual(mem_element);

        file_element = pcb.file.getNext();
    }
}

const testObject = new ParsableObject({
    sss: "this is a random string",
    iii: 10,
    fff: 3.14
});

const filePath = `${tmpObj.name}/bf.dat`;

beforeEach(() => {
    try {
        fs.unlinkSync(filePath);
    }
    catch (e) {
        var i = 0;
    };
})

describe("Instantiations that work", function () {
    it("Creates a backing file when none exists", () => {

        const pcb = new PersistentCircularBuffer(10, testObject.parser, filePath);

        expect(() => fs.accessSync(filePath, fs.constants.W_OK)).not.toThrow();
        _test_internal_consistency(pcb);

    });
    it("Data can be written to the buffer and read back", () => {

        const pcb = new PersistentCircularBuffer(10, testObject.parser, filePath);

        for (var i = 0; i < 3; i++) {
            const te = { iii: i, fff: i, sss: "te" };
            pcb.push(te);
        };
        expect(pcb.capacity()).toEqual(10);
        expect(pcb.size()).toEqual(3);
        expect(pcb.toarray()).toEqual([{ iii: 0, fff: 0, sss: "te" }, { iii: 1, fff: 1, sss: "te" }, { iii: 2, fff: 2, sss: "te" }]);
        _test_internal_consistency(pcb);

        pcb.close();
    });
    it("Restores all data if compatible file already exists. ", () => {
        const pcb = new PersistentCircularBuffer(10, testObject.parser, filePath);

        for (var i = 0; i < 3; i++) {
            const te = { iii: i, fff: i, sss: "te" };
            pcb.push(te);
        };

        pcb.close();        // "don't forget to .close()"

        const pcb1 = new PersistentCircularBuffer(10, testObject.parser, filePath);
        expect(pcb1.toarray()).toEqual([{ iii: 0, fff: 0, sss: "te" }, { iii: 1, fff: 1, sss: "te" }, { iii: 2, fff: 2, sss: "te" }]);

        pcb.close();
    });
});

describe("Instantiations that fail in expected ways", () => {
    it("Fails when path is invalid or unwritable", () => {
        expect(() => new PersistentCircularBuffer(10, testObject.parser, "/blort/argle")).toThrowError(/^ENOENT: .*/);
    });
    it("Fails when file exists but has other schema", () => {
        const pcb = new PersistentCircularBuffer(10, testObject.parser, filePath);

        // this is a non-error, but it arguably should be: @see FixedRecordFile doesn't mind if parser of new obj is different from parser in the
        // file it is opening, so long as the record size is the same.  Here, we create a parser with 2 ints and a string vs 1 float, 1 int and same size string.
        // it works! Unexpectedly!  And will decode the record incorrectly.
        var to2 = new ParsableObject({ fff: 22, iii: 1, sss: "this is a random string" });
        const pcb2 = new PersistentCircularBuffer(10, to2.parser, filePath);
        expect(pcb2 instanceof PersistentCircularBuffer).toBeTruthy();

        var to2 = new ParsableObject({ fff: 22, iii: 1, sss: "abcd" });      // But instantiation fails if *length* of record is any different.
        expect(() => new PersistentCircularBuffer(10, to2.parser, filePath)).toThrowError(/.*Record size of file \(31\) does not match defined record size \(12\)/)
    });
});

describe("Long term use -- buffer wraps", () => {
    it("retains only the N most recent entries.", () => {
        const pcb_capacity = 10;
        const pcb = new PersistentCircularBuffer(pcb_capacity, testObject.parser, filePath);

        for (var i = 0; i < 95; i++) {  //i.e [0...94], last 10 of which are [85...94]
            const te = { iii: i, fff: i + 0.5, sss: "te" };
            pcb.push(te);
        };

        const v = pcb.toarray();
        expect(v.length).toEqual(pcb_capacity);

        var observed = [];
        for (i = 0; i < pcb_capacity; i++) {
            observed.push((v[i]).fff);        // to make the test a little non-trivial, look for the *float* value
        }
        const expected = Array.from({ length: 10 }, (_, i) => i + 85.5); // upvoted answer: https://stackoverflow.com/a/33352604/2036651

        expect(observed).toEqual(expected);
    });
});
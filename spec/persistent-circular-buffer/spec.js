const { CircularFile } = require('structured-binary-file');
const CircularBuffer = require('circular-buffer');
const { FixedRecordFile } = require("structured-binary-file");
const { Parser } = require("binary-parser-encoder");
const PersistentCircularBuffer = require("../../persistent-circular-buffer");
const { round } = require('lodash');
const tmp = require('tmp');
const tmpObj = tmp.dirSync();



/**
 * Create an item and corresponding @see binary-parser-encoder.Parser
 *
 * item can be an object containing strings, ints and floats, but no Objects (yet).
 *
 * @class TestElement
 */
class TestElement {

    /**
     * Creates an instance of TestElement.
     * @param {*} element -- (usually) an object containing values.
     * values can be primitives or strings but not nested  objects.
     * Current value of strings defines the maximum length of string i nthe parser.
     * @memberof TestElement
     */
    constructor (element) {
        this.element = element;
        this.parser = new Parser();

        for (const [k, v] of Object.entries(element)) {
            switch (typeof(v)) {
                case 'string':
                    this.parser.string(k, {length: v.length, trim: true});
                    break;
                case 'number':
                    if (round(v) == v) {
                        this.parser.int32(k);
                    } else {
                        this.parser.floatbe(k);
                    }
                    break;
                case 'boolean':
                    this.parser.bit1(k);
                    break;
                default:
                    throw `can't create TestElement with member of type ${typeof(v)}.`
            }
        }
    }
}

describe("Instantiations that work", function() {
    const my_element = new TestElement({
        sss: "this is a random string",
        iii: 10,
        fff: 3.14,
        bbb: false
    });

    const filePath = `${tmpObj.name}/bf.dat`;

    it("Accepts fixed length elements", () => {
        const pcb = new PersistentCircularBuffer(10, my_element.parser, filePath );
        expect(pcb).toBeTruthy();
        for (var i = 0; i<3; i++) {
            pcb.push(my_element.element); //append same element 3 times
        }
    });
    it("Works when backing file does not exist", ()=>{});
    it("Works when backing file exists with same schema",()=>{});
});

describe("Instantiations that fail in expected ways", ()=>{
    it("Fails when path is invalid or unwritable", ()=>{});
    it("Fails when file exists but has other schema", ()=>{});
});

describe("Early use - buffer does not wrap", ()=>{});

describe("Long term use -- buffer wraps", ()=>{});
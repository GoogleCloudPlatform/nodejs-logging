import {
  ObjectToStructConverter,
  ObjectToStructConverterConfig,
} from '../src/common';
import * as assert from 'assert';
const OPTIONS = {
  maxRetries: 3,
} as ObjectToStructConverterConfig;

describe('ObjectToStructConverter', () => {
  let objectToStructConverter;

  beforeEach(() => {
    objectToStructConverter = new ObjectToStructConverter(OPTIONS);
  });

  describe('instantiation', () => {
    it('should not require an options object', () => {
      assert.doesNotThrow(() => {
        const x = new ObjectToStructConverter();
      });
    });

    it('should localize an empty Set for seenObjects', () => {
      assert(objectToStructConverter.seenObjects instanceof Set);
      assert.strictEqual(objectToStructConverter.seenObjects.size, 0);
    });

    it('should localize options', () => {
      const objectToStructConverter = new ObjectToStructConverter({
        removeCircular: true,
        stringify: true,
      });

      assert.strictEqual(objectToStructConverter.removeCircular, true);
      assert.strictEqual(objectToStructConverter.stringify, true);
    });

    it('should set correct defaults', () => {
      assert.strictEqual(objectToStructConverter.removeCircular, false);
      assert.strictEqual(objectToStructConverter.stringify, false);
    });
  });

  describe('convert', () => {
    it('should encode values in an Object', () => {
      const inputValue = {};
      const convertedValue = {};

      objectToStructConverter.encodeValue_ = value => {
        assert.strictEqual(value, inputValue);
        return convertedValue;
      };

      const struct = objectToStructConverter.convert({
        a: inputValue,
      });

      assert.strictEqual(struct.fields.a, convertedValue);
    });

    it('should support host objects', () => {
      const hostObject = {hasOwnProperty: null};

      objectToStructConverter.encodeValue_ = () => {};

      assert.doesNotThrow(() => {
        objectToStructConverter.convert(hostObject);
      });
    });

    it('should not include undefined values', done => {
      objectToStructConverter.encodeValue_ = () => {
        done(new Error('Should not be called'));
      };

      const struct = objectToStructConverter.convert({
        a: undefined,
      });

      assert.deepStrictEqual(struct.fields, {});

      done();
    });

    it('should add seen objects to set then empty set', done => {
      const obj = {};
      let objectAdded;

      objectToStructConverter.seenObjects = {
        add(obj) {
          objectAdded = obj;
        },
        delete(obj_) {
          assert.strictEqual(obj_, obj);
          assert.strictEqual(objectAdded, obj);
          done();
        },
      };

      objectToStructConverter.convert(obj);
    });
  });

  describe('encodeValue_', () => {
    it('should convert primitive values correctly', () => {
      const buffer = Buffer.from('Value');

      assert.deepStrictEqual(objectToStructConverter.encodeValue_(null), {
        nullValue: 0,
      });

      assert.deepStrictEqual(objectToStructConverter.encodeValue_(1), {
        numberValue: 1,
      });

      assert.deepStrictEqual(objectToStructConverter.encodeValue_('Hi'), {
        stringValue: 'Hi',
      });

      assert.deepStrictEqual(objectToStructConverter.encodeValue_(true), {
        boolValue: true,
      });

      assert.strictEqual(
        objectToStructConverter.encodeValue_(buffer).blobValue.toString(),
        'Value'
      );
    });

    it('should convert arrays', () => {
      const convertedValue = objectToStructConverter.encodeValue_([1, 2, 3]);

      assert.deepStrictEqual(convertedValue.listValue, {
        values: [
          objectToStructConverter.encodeValue_(1),
          objectToStructConverter.encodeValue_(2),
          objectToStructConverter.encodeValue_(3),
        ],
      });
    });

    it('should throw if a type is not recognized', () => {
      assert.throws(() => {
        objectToStructConverter.encodeValue_();
      }, /Value of type undefined not recognized./);
    });

    describe('objects', () => {
      const VALUE: {circularReference?: {}} = {};
      VALUE.circularReference = VALUE;

      it('should convert objects', () => {
        const convertedValue = {};

        objectToStructConverter.convert = value => {
          assert.strictEqual(value, VALUE);
          return convertedValue;
        };

        assert.deepStrictEqual(objectToStructConverter.encodeValue_(VALUE), {
          structValue: convertedValue,
        });
      });

      describe('circular references', () => {
        it('should throw if circular', () => {
          const errorMessage = [
            'This object contains a circular reference. To automatically',
            'remove it, set the `removeCircular` option to true.',
          ].join(' ');

          objectToStructConverter.seenObjects.add(VALUE);

          assert.throws(() => {
            objectToStructConverter.encodeValue_(VALUE);
          }, new RegExp(errorMessage));
        });

        describe('options.removeCircular', () => {
          let objectToStructConverter;

          beforeEach(() => {
            objectToStructConverter = new ObjectToStructConverter({
              removeCircular: true,
            });

            objectToStructConverter.seenObjects.add(VALUE);
          });

          it('should replace circular reference with [Circular]', () => {
            assert.deepStrictEqual(
              objectToStructConverter.encodeValue_(VALUE),
              {stringValue: '[Circular]'}
            );
          });
        });
      });
    });

    describe('options.stringify', () => {
      let objectToStructConverter;

      beforeEach(() => {
        objectToStructConverter = new ObjectToStructConverter({
          stringify: true,
        });
      });

      it('should return a string if the value is not recognized', () => {
        const date = new Date();

        assert.deepStrictEqual(
          objectToStructConverter.encodeValue_(date, OPTIONS),
          {stringValue: String(date)}
        );
      });
    });
  });
});

import { SimpleAllies } from '../src/simpleAllies';

let ally1: SimpleAllies;
let ally2: SimpleAllies;

beforeAll(() => {
    ally1 = new SimpleAllies();
    ally1.addAlly('ally2');
    ally2 = new SimpleAllies();
    ally2.addAlly('ally1');
});

describe('basic', () => {
    it('inits', () => {
        ally1.initRun();
    });
    it('runs', () => {
        ally1.endRun();
    });
});

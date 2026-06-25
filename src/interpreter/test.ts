import { generateTrace } from './interpreter';

const snippet1 = `
class LoopTest {
    public static void main(String[] args) {
        int sum = 0;
        for (int i = 1; i <= 3; i++) {
            sum += i;
            System.out.println("i=" + i + ", sum=" + sum);
        }
    }
}
`;

const snippet2 = `
class ArrayTest {
    public static void main(String[] args) {
        int[] nums = {4, 2, 8};
        int temp = nums[0];
        nums[0] = nums[1];
        nums[1] = temp;
        System.out.println("nums[0]=" + nums[0] + ", nums[1]=" + nums[1]);
    }
}
`;

const snippet3 = `
class Point {
    int x;
    int y;
    Point(int x, int y) {
        this.x = x;
        this.y = y;
    }
}

class ObjectTest {
    public static void main(String[] args) {
        Point p = new Point(10, 20);
        System.out.println("x = " + p.x);
    }
}
`;

function runTest(name: string, code: string) {
  console.log(`=============================`);
  console.log(`RUNNING TEST: ${name}`);
  console.log(`=============================`);
  try {
    const { trace, error } = generateTrace(code);
    if (error) {
      console.log(`Execution encountered an error: ${error}`);
    }
    console.log(`Trace processed. Total Steps: ${trace.length}`);
    if (trace.length > 0) {
      console.log(`Console Output:\n${trace[trace.length - 1].output}`);
    }
    
    // Print a few sample steps
    console.log(`Sample Steps:`);
    for (let i = 0; i < Math.min(5, trace.length); i++) {
      console.log(`  Step ${i} (Line ${trace[i].line}): ${trace[i].explanation}`);
    }
    if (trace.length > 5) {
      console.log(`  ...`);
      const last = trace[trace.length - 1];
      console.log(`  Step ${last.stepId} (Line ${last.line}): ${last.explanation}`);
    }
  } catch (e: any) {
    console.error(`TEST FAILED WITH ERROR:`, e.message);
  }
  console.log(`\n`);
}

runTest('1. Variables & Loops', snippet1);
runTest('2. Array Manipulation', snippet2);
runTest('3. Methods & Objects', snippet3);

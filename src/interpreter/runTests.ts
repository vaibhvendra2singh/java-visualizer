import { generateTrace } from './interpreter';

const testCases = [
  {
    name: '1. long literal suffix & basic casting',
    code: `
      class Test {
        public static void main(String[] args) {
          long n = 100L;
          int x = (int) 3.7;
          double d = (double) n;
          System.out.println("n=" + n + ", x=" + x + ", d=" + d);
        }
      }
    `,
    expected: 'n=100, x=3, d=100'
  },
  {
    name: '2. for-each loop & ArrayList simulation',
    code: `
      import java.util.ArrayList;
      import java.util.List;
      class Test {
        public static void main(String[] args) {
          List<Integer> list = new ArrayList<>();
          list.add(10);
          list.add(20);
          list.add(30);
          int sum = 0;
          for (int x : list) {
            sum += x;
          }
          System.out.println("sum=" + sum + ", size=" + list.size());
        }
      }
    `,
    expected: 'sum=60, size=3'
  },
  {
    name: '3. switch-case with fall-through & break',
    code: `
      class Test {
        public static void main(String[] args) {
          for (int i = 1; i <= 3; i++) {
            switch (i) {
              case 1:
                System.out.print("one ");
                break;
              case 2:
                System.out.print("two ");
              case 3:
                System.out.print("three ");
                break;
            }
          }
          System.out.println();
        }
      }
    `,
    expected: 'one two three three'
  },
  {
    name: '4. ternary operator',
    code: `
      class Test {
        public static void main(String[] args) {
          int a = 10, b = 20;
          int max = a > b ? a : b;
          System.out.println("max=" + max);
        }
      }
    `,
    expected: 'max=20'
  },
  {
    name: '5. String instance methods',
    code: `
      class Test {
        public static void main(String[] args) {
          String s = "  Java 17!  ";
          String trimmed = s.trim();
          int len = trimmed.length();
          char c = trimmed.charAt(0);
          String sub = trimmed.substring(0, 4);
          boolean eq = trimmed.equals("Java 17!");
          System.out.println("trimmed='" + trimmed + "', len=" + len + ", char=" + c + ", sub=" + sub + ", eq=" + eq);
        }
      }
    `,
    expected: "trimmed='Java 17!', len=8, char=J, sub=Java, eq=true"
  },
  {
    name: '6. HashMap & HashSet simulation',
    code: `
      import java.util.HashMap;
      import java.util.HashSet;
      import java.util.Map;
      import java.util.Set;
      class Test {
        public static void main(String[] args) {
          Map<String, Integer> map = new HashMap<>();
          map.put("apple", 5);
          map.put("banana", 3);
          Set<String> set = new HashSet<>();
          set.add("apple");
          set.add("cherry");
          System.out.println("apple=" + map.get("apple") + ", cherry_in_set=" + set.contains("cherry") + ", banana_in_set=" + set.contains("banana"));
        }
      }
    `,
    expected: 'apple=5, cherry_in_set=true, banana_in_set=false'
  },
  {
    name: '7. do-while loop',
    code: `
      class Test {
        public static void main(String[] args) {
          int i = 0;
          do {
            i++;
          } while (i < 5);
          System.out.println("i=" + i);
        }
      }
    `,
    expected: 'i=5'
  },
  {
    name: '8. bitwise operators & compounds',
    code: `
      class Test {
        public static void main(String[] args) {
          int a = 6;  // 0110
          int b = 3;  // 0011
          int and = a & b; // 0010 (2)
          int or = a | b;  // 0111 (7)
          int xor = a ^ b; // 0101 (5)
          int shift = 1 << 3; // 8
          int comp = ~0; // -1
          
          int x = 1;
          x <<= 2; // 4
          
          System.out.println("and=" + and + ", or=" + or + ", xor=" + xor + ", shift=" + shift + ", comp=" + comp + ", compound=" + x);
        }
      }
    `,
    expected: 'and=2, or=7, xor=5, shift=8, comp=-1, compound=4'
  },
  {
    name: '9. prefix/postfix ++/-- on arrays and fields',
    code: `
      class Counter {
        int count = 0;
      }
      class Test {
        public static void main(String[] args) {
          int[] arr = {10, 20};
          arr[0]++;
          --arr[1];
          Counter c = new Counter();
          c.count++;
          System.out.println("arr[0]=" + arr[0] + ", arr[1]=" + arr[1] + ", field=" + c.count);
        }
      }
    `,
    expected: 'arr[0]=11, arr[1]=19, field=1'
  },
  {
    name: '10. instanceof keyword',
    code: `
      import java.util.ArrayList;
      import java.util.List;
      class Test {
        public static void main(String[] args) {
          List<Integer> list = new ArrayList<>();
          boolean isList = list instanceof List;
          boolean isArrayList = list instanceof ArrayList;
          System.out.println("isList=" + isList + ", isArrayList=" + isArrayList);
        }
      }
    `,
    expected: 'isList=true, isArrayList=true'
  }
];

export interface DiagnosticResult {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  error?: string;
}

export function runInterpreterTests(): DiagnosticResult[] {
  const results: DiagnosticResult[] = [];
  console.log('%c--- STARTING JAVA 17 COMPATIBILITY TEST SUITE ---', 'color: #3b82f6; font-weight: bold; font-size: 14px;');
  let passedCount = 0;
  
  testCases.forEach((tc) => {
    try {
      const { trace, error } = generateTrace(tc.code);
      if (error) {
        console.error(`❌ ${tc.name} failed with runtime error: ${error}`);
        results.push({
          name: tc.name,
          passed: false,
          expected: tc.expected,
          actual: '',
          error: error
        });
        return;
      }
      
      const lastStep = trace[trace.length - 1];
      const output = lastStep ? lastStep.output.trim() : '';
      if (output.includes(tc.expected)) {
        console.log(`%c✅ ${tc.name} PASSED`, 'color: #10b981; font-weight: 600;');
        passedCount++;
        results.push({
          name: tc.name,
          passed: true,
          expected: tc.expected,
          actual: output
        });
      } else {
        console.error(`❌ ${tc.name} FAILED.\nExpected output to contain: "${tc.expected}"\nGot output: "${output}"`);
        results.push({
          name: tc.name,
          passed: false,
          expected: tc.expected,
          actual: output,
          error: 'Output mismatch'
        });
      }
    } catch (e: any) {
      console.error(`❌ ${tc.name} crashed:`, e.message);
      results.push({
        name: tc.name,
        passed: false,
        expected: tc.expected,
        actual: '',
        error: e.message
      });
    }
  });

  console.log(`%c--- TEST SUITE COMPLETE: ${passedCount}/${testCases.length} PASSED ---`, 'color: #3b82f6; font-weight: bold;');
  return results;
}

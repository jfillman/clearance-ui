import { configure } from '@testing-library/react';

// findBy and waitFor wait 1 s by default; these views render a lot of Material UI, and a loaded CI runner took longer
// than that to show a refusal. A generous ceiling costs nothing when the answer is quick.
configure({ asyncUtilTimeout: 5000 });

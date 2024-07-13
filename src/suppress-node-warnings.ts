const originalEmitWarning = process.emitWarning;

// @ts-expect-error
process.emitWarning = (warning, type, code: string, ...args) => {
  // List of warning codes to suppress
  const suppressedWarnings = [
    'DEP0040' /* punycode warning */,
    'ExperimentalWarning'
  ];

  if (suppressedWarnings.includes(code)) return;

  // Call the original emitWarning function for other warnings
  // @ts-expect-error
  originalEmitWarning.call(process, warning, type, code, ...args);
};

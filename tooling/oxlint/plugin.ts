// clippy rules mapped for js with oxlint
import needlessBool from './rules/needless-bool.ts'
import collapsibleIf from './rules/collapsible-if.ts'
import negMultiply from './rules/neg-multiply.ts'
import boolComparison from './rules/bool-comparison.ts'
import identityOp from './rules/identity-op.ts'
import singleCaseSwitch from './rules/single-case-switch.ts'
import tooManyArguments from './rules/too-many-arguments.ts'
import tooManyLines from './rules/too-many-lines.ts'
import filterThenFirst from './rules/filter-then-first.ts'
import mapVoidReturn from './rules/map-void-return.ts'
import uselessConversion from './rules/useless-conversion.ts'
import manualClamp from './rules/manual-clamp.ts'
import manualStrip from './rules/manual-strip.ts'
import manualFind from './rules/manual-find.ts'
import manualSome from './rules/manual-some.ts'
import manualEvery from './rules/manual-every.ts'
import manualIncludes from './rules/manual-includes.ts'
import cognitiveComplexity from './rules/cognitive-complexity.ts'
import floatComparison from './rules/float-comparison.ts'
import needlessRangeLoop from './rules/needless-range-loop.ts'
import manualSwap from './rules/manual-swap.ts'
import searchIsSome from './rules/search-is-some.ts'
import letAndReturn from './rules/let-and-return.ts'
import xorUsedAsPow from './rules/xor-used-as-pow.ts'
import mapIdentity from './rules/map-identity.ts'
import redundantClosureCall from './rules/redundant-closure-call.ts'
import almostSwapped from './rules/almost-swapped.ts'
import ifSameThenElse from './rules/if-same-then-else.ts'
import neverLoop from './rules/never-loop.ts'
import explicitCounterLoop from './rules/explicit-counter-loop.ts'
import excessiveNesting from './rules/excessive-nesting.ts'
import fnParamsExcessiveBools from './rules/fn-params-excessive-bools.ts'
import floatEqualityWithoutAbs from './rules/float-equality-without-abs.ts'
import manualIsFinite from './rules/manual-is-finite.ts'
import unnecessaryFold from './rules/unnecessary-fold.ts'
import needlessLateInit from './rules/needless-late-init.ts'
import singleElementLoop from './rules/single-element-loop.ts'
import intPlusOne from './rules/int-plus-one.ts'
import zeroDividedByZero from './rules/zero-divided-by-zero.ts'
import redundantClosure from './rules/redundant-closure.ts'
import unnecessaryReduceCollect from './rules/unnecessary-reduce-collect.ts'
import preferStructuredClone from './rules/prefer-structured-clone.ts'
import objectKeysValues from './rules/object-keys-values.ts'
import promiseNewResolve from './rules/promise-new-resolve.ts'
import similarNames from './rules/similar-names.ts'
import matchSameArms from './rules/match-same-arms.ts'
import usedUnderscoreBinding from './rules/used-underscore-binding.ts'
import needlessContinue from './rules/needless-continue.ts'
import enumVariantNames from './rules/enum-variant-names.ts'
import structFieldNames from './rules/struct-field-names.ts'
import unreadableLiteral from './rules/unreadable-literal.ts'
import boolToIntWithIf from './rules/bool-to-int-with-if.ts'

const plugin = {
  meta: {
    name: 'clippy',
    version: '0.0.0'
  },
  rules: {
    // Style — code clarity and readability
    'needless-bool': needlessBool,
    'collapsible-if': collapsibleIf,
    'neg-multiply': negMultiply,
    'bool-comparison': boolComparison,
    'single-case-switch': singleCaseSwitch,
    'let-and-return': letAndReturn,
    'int-plus-one': intPlusOne,
    'needless-late-init': needlessLateInit,

    // Complexity — simplifiable patterns
    'identity-op': identityOp,
    'manual-clamp': manualClamp,
    'manual-strip': manualStrip,
    'useless-conversion': uselessConversion,
    'manual-swap': manualSwap,
    'manual-is-finite': manualIsFinite,

    // Correctness — likely bugs
    'float-comparison': floatComparison,
    'xor-used-as-pow': xorUsedAsPow,
    'almost-swapped': almostSwapped,
    'if-same-then-else': ifSameThenElse,
    'never-loop': neverLoop,
    'float-equality-without-abs': floatEqualityWithoutAbs,
    'zero-divided-by-zero': zeroDividedByZero,

    // Iterator — loops replaceable with array methods
    'filter-then-first': filterThenFirst,
    'map-void-return': mapVoidReturn,
    'map-identity': mapIdentity,
    'manual-find': manualFind,
    'manual-some': manualSome,
    'manual-every': manualEvery,
    'manual-includes': manualIncludes,
    'search-is-some': searchIsSome,
    'needless-range-loop': needlessRangeLoop,
    'redundant-closure-call': redundantClosureCall,
    'explicit-counter-loop': explicitCounterLoop,
    'unnecessary-fold': unnecessaryFold,
    'single-element-loop': singleElementLoop,

    // Functions — function-level quality
    'too-many-arguments': tooManyArguments,
    'too-many-lines': tooManyLines,
    'cognitive-complexity': cognitiveComplexity,
    'excessive-nesting': excessiveNesting,
    'fn-params-excessive-bools': fnParamsExcessiveBools,

    // Principles — idiomatic JS/TS from Clippy philosophy
    'redundant-closure': redundantClosure,
    'unnecessary-reduce-collect': unnecessaryReduceCollect,
    'prefer-structured-clone': preferStructuredClone,
    'object-keys-values': objectKeysValues,
    'promise-new-resolve': promiseNewResolve,

    // Pedantic — naming, style, readability
    'similar-names': similarNames,
    'match-same-arms': matchSameArms,
    'used-underscore-binding': usedUnderscoreBinding,
    'needless-continue': needlessContinue,
    'enum-variant-names': enumVariantNames,
    'struct-field-names': structFieldNames,
    'unreadable-literal': unreadableLiteral,
    'bool-to-int-with-if': boolToIntWithIf
  }
}

export default plugin

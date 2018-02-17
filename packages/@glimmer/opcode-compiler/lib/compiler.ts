import { OpcodeBuilder, StdOpcodeBuilder } from './opcode-builder';
import { Macros } from './syntax';
import { compile } from './compile';
import { debugSlice } from './debug';
import { Compiler, Option, CompilableBlock, STDLib, CompileTimeConstants, CompileTimeLookup, CompileTimeProgram, LayoutWithContext, Opaque, CompilerBuffer, ResolvedLayout, MaybeResolvedLayout, CompilableProgram } from "@glimmer/interfaces";
import { Statements, Core, Expression, Statement } from "@glimmer/wire-format";
import { DEBUG } from "@glimmer/local-debug-flags";

export abstract class AbstractCompiler<Locator, Builder extends OpcodeBuilder<Locator>> implements Compiler<Builder> {
  protected abstract macros: Macros;

  abstract resolver: CompileTimeLookup<Locator>;
  protected abstract program: CompileTimeProgram;
  abstract constants: CompileTimeConstants;
  abstract stdLib: Option<STDLib>;

  initialize() {
    let main = this.std(b => b.main());
    let trustingGuardedAppend = this.std(b => b.stdAppend(true));
    let cautiousGuardedAppend = this.std(b => b.stdAppend(false));

    this.stdLib = { main, trustingGuardedAppend, cautiousGuardedAppend };
  }

  private std(callback: (builder: StdOpcodeBuilder) => void): number {
    return StdOpcodeBuilder.build(this, callback);
  }

  compileInline(sexp: Statements.Append, builder: Builder): ['expr', Expression] | true {
    let { inlines } = this.macros;
    return inlines.compile(sexp, builder);
  }

  compileBlock(name: string, params: Core.Params, hash: Core.Hash, template: Option<CompilableBlock>, inverse: Option<CompilableBlock>, builder: Builder): void {
    let { blocks } = this.macros;
    blocks.compile<Locator>(name, params, hash, template, inverse, builder);
  }

  add(statements: Statement[], containingLayout: LayoutWithContext<Locator>): number {
    return compile(statements, this.builderFor(containingLayout), this);
  }

  commit(scopeSize: number, buffer: CompilerBuffer): number {
    let heap = this.program.heap;

    // TODO: change the whole malloc API and do something more efficient
    let handle = heap.malloc();

    for (let i = 0; i < buffer.length; i++) {
      let value = buffer[i];

      if (typeof value === 'function') {
        heap.pushPlaceholder(value);
      } else {
        heap.push(value);
      }
    }

    heap.finishMalloc(handle, scopeSize);

    return handle;
  }

  resolveLayoutForTag(tag: string, referrer: Locator): MaybeResolvedLayout {
    let { resolver } = this;

    let handle = resolver.lookupComponentDefinition(tag, referrer);

    if (handle === null) return { handle: null, capabilities: null, compilable: null };

    return this.resolveLayoutForHandle(handle);

  }

  resolveLayoutForHandle(handle: number): ResolvedLayout {
    let { resolver } = this;

    let capabilities = resolver.getCapabilities(handle);
    let compilable: Option<CompilableProgram> = null;

    if (!capabilities.dynamicLayout) {
      compilable = resolver.getLayout(handle)!;
    }

    return {
      handle,
      capabilities,
      compilable
    };
  }

  resolveModifier(name: string, referrer: Locator): Option<number> {
    return this.resolver.lookupModifier(name, referrer);
  }

  resolveHelper(name: string, referrer: Locator): Option<number> {
    return this.resolver.lookupHelper(name, referrer);
  }

  abstract builderFor(containingLayout: LayoutWithContext<Opaque>): Builder;
}

export let debug: (compiler: AnyAbstractCompiler, handle: number) => void;

if (DEBUG) {
  debug = (compiler: AnyAbstractCompiler, handle: number) => {
    let { heap } = compiler['program'];
    let start = heap.getaddr(handle);
    let end = start + heap.sizeof(handle);

    debugSlice(compiler['program'], start, end);
  };
}

export type AnyAbstractCompiler = AbstractCompiler<Opaque, OpcodeBuilder<Opaque>>;

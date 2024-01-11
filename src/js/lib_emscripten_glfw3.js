// Javascript implementation called from cpp. These functions are considered
// implementation details and should NOT be used outside.
let impl = {
  $GLFW3__deps: ['$GL'],
  $GLFW3__postset: `
    // exports
    Module["requestFullscreen"] = (lockPointer, resizeCanvas) => { GLFW3.requestFullscreen(null, lockPointer, resizeCanvas); }
    Module["glfwGetWindow"] = (canvasSelector) => { const ctx = GLFW3.findContextBySelector(canvasSelector); return ctx ? ctx.glfwWindow : null; };
    Module["glfwGetCanvasSelector"] = (window) => { const ctx = GLFW3.fCanvasContexts[window]; return ctx ? ctx.selector : null; };
    Module["glfwRequestFullscreen"] = GLFW3.requestFullscreen;
    `,
  $GLFW3: {
    fWindowContexts: null,
    fCurrentCanvasContext: null,
    fScaleMQL: null,
    fScaleChangeCallback: null,
    fRequestFullscreen: null,
    fContext: null,

    onScaleChange() {
      if(GLFW3.fScaleChangeCallback) {
        {{{ makeDynCall('vp', 'GLFW3.fScaleChangeCallback') }}}(GLFW3.fContext);
      }
    },

    findContext(canvas) {
      for(let window in GLFW3.fWindowContexts) {
        if(GLFW3.fWindowContexts[window].canvas === canvas) {
          return GLFW3.fWindowContexts[window];
        }
      }
      return null;
    },

    findContextBySelector__deps: ['$findEventTarget'],
    findContextBySelector(canvasSelector) {
      return GLFW3.findContext(findEventTarget(canvasSelector));
    },

    requestFullscreen(target, lockPointer, resizeCanvas) {
      if(GLFW3.fRequestFullscreen) {
        const ctx = target ? GLFW3.findContext(findEventTarget(target)) : null;
        {{{ makeDynCall('vppii', 'GLFW3.fRequestFullscreen') }}}(GLFW3.fContext, ctx ? ctx.glfwWindow : 0, lockPointer, resizeCanvas);
      }
    }
  },

  // see https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_key_values
  emscripten_glfw3_context_to_codepoint: (eventKey) => {
    // TODO: the eventKey gets copied back and forth between C and javascript a few too many times IMO (try to fix)
    eventKey = UTF8ToString(eventKey);
    const codepoint = eventKey.charCodeAt(0);
    if(codepoint < 0x7f && eventKey.length > 1)
      // case when eventKey is something like "Tab" (eventKey.charCodeAt(0) would be "T")
      return 0;
    else
      return codepoint;
  },

  emscripten_glfw3_context_init__deps: ['$specialHTMLTargets'],
  emscripten_glfw3_context_init: (scale, scaleChangeCallback, requestFullscreen, context) => {
    console.log("emscripten_glfw3_context_init()");
    // For backward compatibility with emscripten, defaults to getting the canvas from Module
    specialHTMLTargets["Module['canvas']"] = Module.canvas;
    specialHTMLTargets["window"] = window;
    GLFW3.fWindowContexts = {};
    GLFW3.fCurrentCanvasContext = null;

    GLFW3.fScaleChangeCallback = scaleChangeCallback;
    GLFW3.fRequestFullscreen = requestFullscreen;
    GLFW3.fContext = context;
    GLFW3.fScaleMQL = window.matchMedia('(resolution: ' + scale + 'dppx)');
    GLFW3.fScaleMQL.addEventListener('change', GLFW3.onScaleChange);
  },

  emscripten_glfw3_context_is_any_element_focused: () => {
    return document.activeElement !== document.body;
  },

  emscripten_glfw3_context_get_fullscreen_window: () => {
    const ctx = GLFW3.findContext(document.fullscreenElement);
    return ctx ? ctx.glfwWindow : null;
  },

  emscripten_glfw3_context_get_pointer_lock_window: () => {
    const ctx = GLFW3.findContext(document.pointerLockElement);
    return ctx ? ctx.glfwWindow : null;
  },

  emscripten_glfw3_context_destroy: () => {
    console.log("emscripten_glfw3_context_destroy()");

    GLFW3.fWindowContexts = null;
    GLFW3.fCurrentCanvasContext = null;
    GLFW3.fScaleChangeCallback = null;
    if(GLFW3.fScaleMQL) {
      GLFW3.fScaleMQL.removeEventListener('change', GLFW3.onScaleChange);
    }
    GLFW3.fContext = null;
  },

  emscripten_glfw3_context_window_init__deps: ['$findEventTarget'],
  emscripten_glfw3_context_window_init: (glfwWindow, canvasSelector) => {
    canvasSelector = UTF8ToString(canvasSelector);

    const canvas =  findEventTarget(canvasSelector);

    if(!canvas)
      return {{{ cDefs.EMSCRIPTEN_RESULT_UNKNOWN_TARGET }}};

    // check for duplicate
    if(GLFW3.findContext(canvas)) {
      return {{{ cDefs.EMSCRIPTEN_RESULT_INVALID_TARGET }}};
    }

    var canvasCtx = {};
    canvasCtx.glfwWindow = glfwWindow;
    canvasCtx.selector = canvasSelector;
    canvasCtx.canvas = canvas;
    canvasCtx.originalSize = { width: canvas.width, height: canvas.height};

    canvasCtx.originalCSS = {};
    ["width", "height", "opacity", "cursor", "display"].forEach((name) => {
      canvasCtx.originalCSS[name] = canvas.style.getPropertyValue(name);
    });
    canvasCtx.restoreCSSValue = (name) => {
      const value = canvasCtx.originalCSS[name];
      if(!value)
        canvas.style.removeProperty(name);
      else
        canvas.style.setProperty(name, value);
    };
    canvasCtx.restoreCSSValues = () => {
      Object.entries(canvasCtx.originalCSS).forEach(([name, value]) => {
        if(!value)
          canvas.style.removeProperty(name);
        else
          canvas.style.setProperty(name, value);
      });
    };
    canvasCtx.setCSSValue = (name, value) => {
      canvas.style.setProperty(name, value);
    };
    canvasCtx.getComputedCSSValue = (name) => {
      return window.getComputedStyle(canvas).getPropertyValue(name);
    };

    GLFW3.fWindowContexts[canvasCtx.glfwWindow] = canvasCtx;
    return {{{ cDefs.EMSCRIPTEN_RESULT_SUCCESS }}};
  },

  emscripten_glfw3_context_window_destroy: (glfwWindow) => {
    if(GLFW3.fWindowContexts)
    {
      const ctx = GLFW3.fWindowContexts[glfwWindow];
      const canvas = ctx.canvas;

      ctx.restoreCSSValues();

      canvas.width = ctx.originalSize.width;
      canvas.height = ctx.originalSize.height;

      if(ctx.fCanvasResize)
      {
        ctx.fCanvasResize.observer.disconnect();
        delete ctx.fCanvasResize;
      }

      delete GLFW3.fWindowContexts[glfwWindow];
    }
  },

  emscripten_glfw3_context_window_focus: (glfwWindow) => {
    const canvas = GLFW3.fWindowContexts[glfwWindow].canvas;
    canvas.focus();
  },

  emscripten_glfw3_context_window_set_size: (glfwWindow, width, height, fbWidth, fbHeight) => {
    const ctx = GLFW3.fWindowContexts[glfwWindow];
    const canvas = ctx.canvas;

    if(canvas.width !== fbWidth) canvas.width = fbWidth;
    if(canvas.height !== fbHeight) canvas.height = fbHeight;

    // this will (on purpose) override any css setting
    ctx.setCSSValue("width",   width + "px", "important");
    ctx.setCSSValue("height", height + "px", "important");
  },

  emscripten_glfw3_context_window_get_resize: (glfwWindow, width, height) => {
    const ctx = GLFW3.fWindowContexts[glfwWindow];

    if(!ctx.fCanvasResize)
      return;

    if(ctx.fCanvasResize.target === window) {
      {{{ makeSetValue('width', '0', 'window.innerWidth', 'i32') }}};
      {{{ makeSetValue('height', '0', 'window.innerHeight', 'i32') }}};
    } else {
      const target = ctx.fCanvasResize.target;
      const style = getComputedStyle(target);
      const targetWidth = parseInt(style.width, 10);
      const targetHeight = parseInt(style.height, 10);
      {{{ makeSetValue('width', '0', 'targetWidth', 'i32') }}};
      {{{ makeSetValue('height', '0', 'targetHeight', 'i32') }}};
    }
  },

  emscripten_glfw3_context_window_set_cursor: (glfwWindow, cursor) => {
    const ctx = GLFW3.fWindowContexts[glfwWindow];
    if(cursor)
      ctx.setCSSValue("cursor", UTF8ToString(cursor));
    else
      ctx.restoreCSSValue("cursor");
  },

  emscripten_glfw3_context_window_get_computed_opacity: (glfwWindow) => {
    return GLFW3.fWindowContexts[glfwWindow].getComputedCSSValue("opacity");
  },

  emscripten_glfw3_context_window_set_opacity: (glfwWindow, opacity) => {
    const ctx = GLFW3.fWindowContexts[glfwWindow];
    ctx.setCSSValue("opacity", opacity);
  },

  emscripten_glfw3_context_window_get_computed_visibility: (glfwWindow) => {
    return GLFW3.fWindowContexts[glfwWindow].getComputedCSSValue("display") !== "none";
  },

  emscripten_glfw3_context_window_set_visibility: (glfwWindow, visible) => {
    const ctx = GLFW3.fWindowContexts[glfwWindow];
    if(!visible)
      ctx.setCSSValue("display", "none");
    else
      ctx.restoreCSSValue("display");
  },

  emscripten_glfw3_context_window_set_resize_callback__deps: ['$findEventTarget'],
  emscripten_glfw3_context_window_set_resize_callback: (glfwWindow, canvasResizeSelector, resizeCallback, resizeCallbackUserData) => {
    const ctx = GLFW3.fWindowContexts[glfwWindow];

    if(ctx.fCanvasResize)
    {
      ctx.fCanvasResize.observer.disconnect();
      delete ctx.fCanvasResize;
    }

    if(canvasResizeSelector) {
      canvasResizeSelector = UTF8ToString(canvasResizeSelector);

      const canvasResize =  findEventTarget(canvasResizeSelector);

      if(!canvasResize)
        return {{{ cDefs.EMSCRIPTEN_RESULT_UNKNOWN_TARGET }}};

      ctx.fCanvasResize = {
        target: canvasResize,
        callback: resizeCallback,
      };

      if(canvasResize === window) {
        const listener = (e) => {
          {{{ makeDynCall('vp', 'ctx.fCanvasResize.callback') }}}(resizeCallbackUserData);
        };
        ctx.fCanvasResize.observer = {
          observe: (elt) => { window.addEventListener('resize', listener); },
          disconnect: () => { window.removeEventListener('resize', listener) }
        }
      } else {
        ctx.fCanvasResize.observer = new ResizeObserver((entries) => {
          const ctx = GLFW3.fWindowContexts[glfwWindow];
          if(ctx.fCanvasResize) {
            for(const entry of entries) {
              if(entry.target === canvasResize) {
                {{{ makeDynCall('vp', 'ctx.fCanvasResize.callback') }}}(resizeCallbackUserData);
              }
            }
          }
        });
      }
      ctx.fCanvasResize.observer.observe(canvasResize);
    }

    return {{{ cDefs.EMSCRIPTEN_RESULT_SUCCESS }}};
  },

  emscripten_glfw3_context_gl_init: (glfwWindow) => {
    const canvasCtx = GLFW3.fWindowContexts[glfwWindow];
    if(!canvasCtx)
      return;
    canvasCtx.glAttributes = {};
  },

  emscripten_glfw3_context_gl_bool_attribute: (glfwWindow, attributeName, attributeValue) => {
    const canvasCtx = GLFW3.fWindowContexts[glfwWindow];
    if(!canvasCtx)
      return;
    canvasCtx.glAttributes[UTF8ToString(attributeName)] = !!attributeValue;
  },

  emscripten_glfw3_context_gl_create_context: (glfwWindow) => {
    const canvasCtx = GLFW3.fWindowContexts[glfwWindow];
    if(!canvasCtx)
      return {{{ cDefs.EMSCRIPTEN_RESULT_UNKNOWN_TARGET }}};
    const contextHandle = GL.createContext(canvasCtx.canvas, canvasCtx.glAttributes);
    if(contextHandle) {
      canvasCtx.glContextHandle = contextHandle;
      return {{{ cDefs.EMSCRIPTEN_RESULT_SUCCESS }}};
    } else {
      return {{{ cDefs.EMSCRIPTEN_RESULT_FAILED }}};
    }
  },

  emscripten_glfw3_context_gl_make_context_current: (glfwWindow) => {
    const canvasCtx = GLFW3.fWindowContexts[glfwWindow];
    if(!canvasCtx)
      return {{{ cDefs.EMSCRIPTEN_RESULT_UNKNOWN_TARGET }}};
    if(!canvasCtx.glContextHandle)
      return {{{ cDefs.EMSCRIPTEN_RESULT_FAILED }}};
    if(GL.makeContextCurrent(canvasCtx.glContextHandle))
      return {{{ cDefs.EMSCRIPTEN_RESULT_SUCCESS }}};
    else
      return {{{ cDefs.EMSCRIPTEN_RESULT_FAILED }}};
  },

}

autoAddDeps(impl, '$GLFW3')
mergeInto(LibraryManager.library, impl);

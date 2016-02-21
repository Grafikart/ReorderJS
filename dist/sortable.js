(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * interact.js v1.2.6
 *
 * Copyright (c) 2012-2015 Taye Adeyemi <dev@taye.me>
 * Open source under the MIT License.
 * https://raw.github.com/taye/interact.js/master/LICENSE
 */
(function (realWindow) {
    'use strict';

    // return early if there's no window to work with (eg. Node.js)
    if (!realWindow) { return; }

    var // get wrapped window if using Shadow DOM polyfill
        window = (function () {
            // create a TextNode
            var el = realWindow.document.createTextNode('');

            // check if it's wrapped by a polyfill
            if (el.ownerDocument !== realWindow.document
                && typeof realWindow.wrap === 'function'
                && realWindow.wrap(el) === el) {
                // return wrapped window
                return realWindow.wrap(realWindow);
            }

            // no Shadow DOM polyfil or native implementation
            return realWindow;
        }()),

        document           = window.document,
        DocumentFragment   = window.DocumentFragment   || blank,
        SVGElement         = window.SVGElement         || blank,
        SVGSVGElement      = window.SVGSVGElement      || blank,
        SVGElementInstance = window.SVGElementInstance || blank,
        HTMLElement        = window.HTMLElement        || window.Element,

        PointerEvent = (window.PointerEvent || window.MSPointerEvent),
        pEventTypes,

        hypot = Math.hypot || function (x, y) { return Math.sqrt(x * x + y * y); },

        tmpXY = {},     // reduce object creation in getXY()

        documents       = [],   // all documents being listened to

        interactables   = [],   // all set interactables
        interactions    = [],   // all interactions

        dynamicDrop     = false,

        // {
        //      type: {
        //          selectors: ['selector', ...],
        //          contexts : [document, ...],
        //          listeners: [[listener, useCapture], ...]
        //      }
        //  }
        delegatedEvents = {},

        defaultOptions = {
            base: {
                accept        : null,
                actionChecker : null,
                styleCursor   : true,
                preventDefault: 'auto',
                origin        : { x: 0, y: 0 },
                deltaSource   : 'page',
                allowFrom     : null,
                ignoreFrom    : null,
                _context      : document,
                dropChecker   : null
            },

            drag: {
                enabled: false,
                manualStart: true,
                max: Infinity,
                maxPerElement: 1,

                snap: null,
                restrict: null,
                inertia: null,
                autoScroll: null,

                axis: 'xy'
            },

            drop: {
                enabled: false,
                accept: null,
                overlap: 'pointer'
            },

            resize: {
                enabled: false,
                manualStart: false,
                max: Infinity,
                maxPerElement: 1,

                snap: null,
                restrict: null,
                inertia: null,
                autoScroll: null,

                square: false,
                preserveAspectRatio: false,
                axis: 'xy',

                // use default margin
                margin: NaN,

                // object with props left, right, top, bottom which are
                // true/false values to resize when the pointer is over that edge,
                // CSS selectors to match the handles for each direction
                // or the Elements for each handle
                edges: null,

                // a value of 'none' will limit the resize rect to a minimum of 0x0
                // 'negate' will alow the rect to have negative width/height
                // 'reposition' will keep the width/height positive by swapping
                // the top and bottom edges and/or swapping the left and right edges
                invert: 'none'
            },

            gesture: {
                manualStart: false,
                enabled: false,
                max: Infinity,
                maxPerElement: 1,

                restrict: null
            },

            perAction: {
                manualStart: false,
                max: Infinity,
                maxPerElement: 1,

                snap: {
                    enabled     : false,
                    endOnly     : false,
                    range       : Infinity,
                    targets     : null,
                    offsets     : null,

                    relativePoints: null
                },

                restrict: {
                    enabled: false,
                    endOnly: false
                },

                autoScroll: {
                    enabled     : false,
                    container   : null,     // the item that is scrolled (Window or HTMLElement)
                    margin      : 60,
                    speed       : 300       // the scroll speed in pixels per second
                },

                inertia: {
                    enabled          : false,
                    resistance       : 10,    // the lambda in exponential decay
                    minSpeed         : 100,   // target speed must be above this for inertia to start
                    endSpeed         : 10,    // the speed at which inertia is slow enough to stop
                    allowResume      : true,  // allow resuming an action in inertia phase
                    zeroResumeDelta  : true,  // if an action is resumed after launch, set dx/dy to 0
                    smoothEndDuration: 300    // animate to snap/restrict endOnly if there's no inertia
                }
            },

            _holdDuration: 600
        },

        // Things related to autoScroll
        autoScroll = {
            interaction: null,
            i: null,    // the handle returned by window.setInterval
            x: 0, y: 0, // Direction each pulse is to scroll in

            // scroll the window by the values in scroll.x/y
            scroll: function () {
                var options = autoScroll.interaction.target.options[autoScroll.interaction.prepared.name].autoScroll,
                    container = options.container || getWindow(autoScroll.interaction.element),
                    now = new Date().getTime(),
                    // change in time in seconds
                    dtx = (now - autoScroll.prevTimeX) / 1000,
                    dty = (now - autoScroll.prevTimeY) / 1000,
                    vx, vy, sx, sy;

                // displacement
                if (options.velocity) {
                  vx = options.velocity.x;
                  vy = options.velocity.y;
                }
                else {
                  vx = vy = options.speed
                }
 
                sx = vx * dtx;
                sy = vy * dty;

                if (sx >= 1 || sy >= 1) {
                    if (isWindow(container)) {
                        container.scrollBy(autoScroll.x * sx, autoScroll.y * sy);
                    }
                    else if (container) {
                        container.scrollLeft += autoScroll.x * sx;
                        container.scrollTop  += autoScroll.y * sy;
                    }

                    if (sx >=1) autoScroll.prevTimeX = now;
                    if (sy >= 1) autoScroll.prevTimeY = now;
                }

                if (autoScroll.isScrolling) {
                    cancelFrame(autoScroll.i);
                    autoScroll.i = reqFrame(autoScroll.scroll);
                }
            },

            isScrolling: false,
            prevTimeX: 0,
            prevTimeY: 0,

            start: function (interaction) {
                autoScroll.isScrolling = true;
                cancelFrame(autoScroll.i);

                autoScroll.interaction = interaction;
                autoScroll.prevTimeX = new Date().getTime();
                autoScroll.prevTimeY = new Date().getTime();
                autoScroll.i = reqFrame(autoScroll.scroll);
            },

            stop: function () {
                autoScroll.isScrolling = false;
                cancelFrame(autoScroll.i);
            }
        },

        // Does the browser support touch input?
        supportsTouch = (('ontouchstart' in window) || window.DocumentTouch && document instanceof window.DocumentTouch),

        // Does the browser support PointerEvents
        supportsPointerEvent = !!PointerEvent,

        // Less Precision with touch input
        margin = supportsTouch || supportsPointerEvent? 20: 10,

        pointerMoveTolerance = 1,

        // for ignoring browser's simulated mouse events
        prevTouchTime = 0,

        // Allow this many interactions to happen simultaneously
        maxInteractions = Infinity,

        // Check if is IE9 or older
        actionCursors = (document.all && !window.atob) ? {
            drag    : 'move',
            resizex : 'e-resize',
            resizey : 's-resize',
            resizexy: 'se-resize',

            resizetop        : 'n-resize',
            resizeleft       : 'w-resize',
            resizebottom     : 's-resize',
            resizeright      : 'e-resize',
            resizetopleft    : 'se-resize',
            resizebottomright: 'se-resize',
            resizetopright   : 'ne-resize',
            resizebottomleft : 'ne-resize',

            gesture : ''
        } : {
            drag    : 'move',
            resizex : 'ew-resize',
            resizey : 'ns-resize',
            resizexy: 'nwse-resize',

            resizetop        : 'ns-resize',
            resizeleft       : 'ew-resize',
            resizebottom     : 'ns-resize',
            resizeright      : 'ew-resize',
            resizetopleft    : 'nwse-resize',
            resizebottomright: 'nwse-resize',
            resizetopright   : 'nesw-resize',
            resizebottomleft : 'nesw-resize',

            gesture : ''
        },

        actionIsEnabled = {
            drag   : true,
            resize : true,
            gesture: true
        },

        // because Webkit and Opera still use 'mousewheel' event type
        wheelEvent = 'onmousewheel' in document? 'mousewheel': 'wheel',

        eventTypes = [
            'dragstart',
            'dragmove',
            'draginertiastart',
            'dragend',
            'dragenter',
            'dragleave',
            'dropactivate',
            'dropdeactivate',
            'dropmove',
            'drop',
            'resizestart',
            'resizemove',
            'resizeinertiastart',
            'resizeend',
            'gesturestart',
            'gesturemove',
            'gestureinertiastart',
            'gestureend',

            'down',
            'move',
            'up',
            'cancel',
            'tap',
            'doubletap',
            'hold'
        ],

        globalEvents = {},

        // Opera Mobile must be handled differently
        isOperaMobile = navigator.appName == 'Opera' &&
            supportsTouch &&
            navigator.userAgent.match('Presto'),

        // scrolling doesn't change the result of getClientRects on iOS 7
        isIOS7 = (/iP(hone|od|ad)/.test(navigator.platform)
                         && /OS 7[^\d]/.test(navigator.appVersion)),

        // prefix matchesSelector
        prefixedMatchesSelector = 'matches' in Element.prototype?
                'matches': 'webkitMatchesSelector' in Element.prototype?
                    'webkitMatchesSelector': 'mozMatchesSelector' in Element.prototype?
                        'mozMatchesSelector': 'oMatchesSelector' in Element.prototype?
                            'oMatchesSelector': 'msMatchesSelector',

        // will be polyfill function if browser is IE8
        ie8MatchesSelector,

        // native requestAnimationFrame or polyfill
        reqFrame = realWindow.requestAnimationFrame,
        cancelFrame = realWindow.cancelAnimationFrame,

        // Events wrapper
        events = (function () {
            var useAttachEvent = ('attachEvent' in window) && !('addEventListener' in window),
                addEvent       = useAttachEvent?  'attachEvent': 'addEventListener',
                removeEvent    = useAttachEvent?  'detachEvent': 'removeEventListener',
                on             = useAttachEvent? 'on': '',

                elements          = [],
                targets           = [],
                attachedListeners = [];

            function add (element, type, listener, useCapture) {
                var elementIndex = indexOf(elements, element),
                    target = targets[elementIndex];

                if (!target) {
                    target = {
                        events: {},
                        typeCount: 0
                    };

                    elementIndex = elements.push(element) - 1;
                    targets.push(target);

                    attachedListeners.push((useAttachEvent ? {
                            supplied: [],
                            wrapped : [],
                            useCount: []
                        } : null));
                }

                if (!target.events[type]) {
                    target.events[type] = [];
                    target.typeCount++;
                }

                if (!contains(target.events[type], listener)) {
                    var ret;

                    if (useAttachEvent) {
                        var listeners = attachedListeners[elementIndex],
                            listenerIndex = indexOf(listeners.supplied, listener);

                        var wrapped = listeners.wrapped[listenerIndex] || function (event) {
                            if (!event.immediatePropagationStopped) {
                                event.target = event.srcElement;
                                event.currentTarget = element;

                                event.preventDefault = event.preventDefault || preventDef;
                                event.stopPropagation = event.stopPropagation || stopProp;
                                event.stopImmediatePropagation = event.stopImmediatePropagation || stopImmProp;

                                if (/mouse|click/.test(event.type)) {
                                    event.pageX = event.clientX + getWindow(element).document.documentElement.scrollLeft;
                                    event.pageY = event.clientY + getWindow(element).document.documentElement.scrollTop;
                                }

                                listener(event);
                            }
                        };

                        ret = element[addEvent](on + type, wrapped, Boolean(useCapture));

                        if (listenerIndex === -1) {
                            listeners.supplied.push(listener);
                            listeners.wrapped.push(wrapped);
                            listeners.useCount.push(1);
                        }
                        else {
                            listeners.useCount[listenerIndex]++;
                        }
                    }
                    else {
                        ret = element[addEvent](type, listener, useCapture || false);
                    }
                    target.events[type].push(listener);

                    return ret;
                }
            }

            function remove (element, type, listener, useCapture) {
                var i,
                    elementIndex = indexOf(elements, element),
                    target = targets[elementIndex],
                    listeners,
                    listenerIndex,
                    wrapped = listener;

                if (!target || !target.events) {
                    return;
                }

                if (useAttachEvent) {
                    listeners = attachedListeners[elementIndex];
                    listenerIndex = indexOf(listeners.supplied, listener);
                    wrapped = listeners.wrapped[listenerIndex];
                }

                if (type === 'all') {
                    for (type in target.events) {
                        if (target.events.hasOwnProperty(type)) {
                            remove(element, type, 'all');
                        }
                    }
                    return;
                }

                if (target.events[type]) {
                    var len = target.events[type].length;

                    if (listener === 'all') {
                        for (i = 0; i < len; i++) {
                            remove(element, type, target.events[type][i], Boolean(useCapture));
                        }
                        return;
                    } else {
                        for (i = 0; i < len; i++) {
                            if (target.events[type][i] === listener) {
                                element[removeEvent](on + type, wrapped, useCapture || false);
                                target.events[type].splice(i, 1);

                                if (useAttachEvent && listeners) {
                                    listeners.useCount[listenerIndex]--;
                                    if (listeners.useCount[listenerIndex] === 0) {
                                        listeners.supplied.splice(listenerIndex, 1);
                                        listeners.wrapped.splice(listenerIndex, 1);
                                        listeners.useCount.splice(listenerIndex, 1);
                                    }
                                }

                                break;
                            }
                        }
                    }

                    if (target.events[type] && target.events[type].length === 0) {
                        target.events[type] = null;
                        target.typeCount--;
                    }
                }

                if (!target.typeCount) {
                    targets.splice(elementIndex, 1);
                    elements.splice(elementIndex, 1);
                    attachedListeners.splice(elementIndex, 1);
                }
            }

            function preventDef () {
                this.returnValue = false;
            }

            function stopProp () {
                this.cancelBubble = true;
            }

            function stopImmProp () {
                this.cancelBubble = true;
                this.immediatePropagationStopped = true;
            }

            return {
                add: add,
                remove: remove,
                useAttachEvent: useAttachEvent,

                _elements: elements,
                _targets: targets,
                _attachedListeners: attachedListeners
            };
        }());

    function blank () {}

    function isElement (o) {
        if (!o || (typeof o !== 'object')) { return false; }

        var _window = getWindow(o) || window;

        return (/object|function/.test(typeof _window.Element)
            ? o instanceof _window.Element //DOM2
            : o.nodeType === 1 && typeof o.nodeName === "string");
    }
    function isWindow (thing) { return thing === window || !!(thing && thing.Window) && (thing instanceof thing.Window); }
    function isDocFrag (thing) { return !!thing && thing instanceof DocumentFragment; }
    function isArray (thing) {
        return isObject(thing)
                && (typeof thing.length !== undefined)
                && isFunction(thing.splice);
    }
    function isObject   (thing) { return !!thing && (typeof thing === 'object'); }
    function isFunction (thing) { return typeof thing === 'function'; }
    function isNumber   (thing) { return typeof thing === 'number'  ; }
    function isBool     (thing) { return typeof thing === 'boolean' ; }
    function isString   (thing) { return typeof thing === 'string'  ; }

    function trySelector (value) {
        if (!isString(value)) { return false; }

        // an exception will be raised if it is invalid
        document.querySelector(value);
        return true;
    }

    function extend (dest, source) {
        for (var prop in source) {
            dest[prop] = source[prop];
        }
        return dest;
    }

    var prefixedPropREs = {
      webkit: /(Movement[XY]|Radius[XY]|RotationAngle|Force)$/
    };

    function pointerExtend (dest, source) {
        for (var prop in source) {
          var deprecated = false;

          // skip deprecated prefixed properties
          for (var vendor in prefixedPropREs) {
            if (prop.indexOf(vendor) === 0 && prefixedPropREs[vendor].test(prop)) {
              deprecated = true;
              break;
            }
          }

          if (!deprecated) {
            dest[prop] = source[prop];
          }
        }
        return dest;
    }

    function copyCoords (dest, src) {
        dest.page = dest.page || {};
        dest.page.x = src.page.x;
        dest.page.y = src.page.y;

        dest.client = dest.client || {};
        dest.client.x = src.client.x;
        dest.client.y = src.client.y;

        dest.timeStamp = src.timeStamp;
    }

    function setEventXY (targetObj, pointers, interaction) {
        var pointer = (pointers.length > 1
                       ? pointerAverage(pointers)
                       : pointers[0]);

        getPageXY(pointer, tmpXY, interaction);
        targetObj.page.x = tmpXY.x;
        targetObj.page.y = tmpXY.y;

        getClientXY(pointer, tmpXY, interaction);
        targetObj.client.x = tmpXY.x;
        targetObj.client.y = tmpXY.y;

        targetObj.timeStamp = new Date().getTime();
    }

    function setEventDeltas (targetObj, prev, cur) {
        targetObj.page.x     = cur.page.x      - prev.page.x;
        targetObj.page.y     = cur.page.y      - prev.page.y;
        targetObj.client.x   = cur.client.x    - prev.client.x;
        targetObj.client.y   = cur.client.y    - prev.client.y;
        targetObj.timeStamp = new Date().getTime() - prev.timeStamp;

        // set pointer velocity
        var dt = Math.max(targetObj.timeStamp / 1000, 0.001);
        targetObj.page.speed   = hypot(targetObj.page.x, targetObj.page.y) / dt;
        targetObj.page.vx      = targetObj.page.x / dt;
        targetObj.page.vy      = targetObj.page.y / dt;

        targetObj.client.speed = hypot(targetObj.client.x, targetObj.page.y) / dt;
        targetObj.client.vx    = targetObj.client.x / dt;
        targetObj.client.vy    = targetObj.client.y / dt;
    }

    function isNativePointer (pointer) {
        return (pointer instanceof window.Event
            || (supportsTouch && window.Touch && pointer instanceof window.Touch));
    }

    // Get specified X/Y coords for mouse or event.touches[0]
    function getXY (type, pointer, xy) {
        xy = xy || {};
        type = type || 'page';

        xy.x = pointer[type + 'X'];
        xy.y = pointer[type + 'Y'];

        return xy;
    }

    function getPageXY (pointer, page) {
        page = page || {};

        // Opera Mobile handles the viewport and scrolling oddly
        if (isOperaMobile && isNativePointer(pointer)) {
            getXY('screen', pointer, page);

            page.x += window.scrollX;
            page.y += window.scrollY;
        }
        else {
            getXY('page', pointer, page);
        }

        return page;
    }

    function getClientXY (pointer, client) {
        client = client || {};

        if (isOperaMobile && isNativePointer(pointer)) {
            // Opera Mobile handles the viewport and scrolling oddly
            getXY('screen', pointer, client);
        }
        else {
          getXY('client', pointer, client);
        }

        return client;
    }

    function getScrollXY (win) {
        win = win || window;
        return {
            x: win.scrollX || win.document.documentElement.scrollLeft,
            y: win.scrollY || win.document.documentElement.scrollTop
        };
    }

    function getPointerId (pointer) {
        return isNumber(pointer.pointerId)? pointer.pointerId : pointer.identifier;
    }

    function getActualElement (element) {
        return (element instanceof SVGElementInstance
            ? element.correspondingUseElement
            : element);
    }

    function getWindow (node) {
        if (isWindow(node)) {
            return node;
        }

        var rootNode = (node.ownerDocument || node);

        return rootNode.defaultView || rootNode.parentWindow || window;
    }

    function getElementClientRect (element) {
        var clientRect = (element instanceof SVGElement
                            ? element.getBoundingClientRect()
                            : element.getClientRects()[0]);

        return clientRect && {
            left  : clientRect.left,
            right : clientRect.right,
            top   : clientRect.top,
            bottom: clientRect.bottom,
            width : clientRect.width || clientRect.right - clientRect.left,
            height: clientRect.height || clientRect.bottom - clientRect.top
        };
    }

    function getElementRect (element) {
        var clientRect = getElementClientRect(element);

        if (!isIOS7 && clientRect) {
            var scroll = getScrollXY(getWindow(element));

            clientRect.left   += scroll.x;
            clientRect.right  += scroll.x;
            clientRect.top    += scroll.y;
            clientRect.bottom += scroll.y;
        }

        return clientRect;
    }

    function getTouchPair (event) {
        var touches = [];

        // array of touches is supplied
        if (isArray(event)) {
            touches[0] = event[0];
            touches[1] = event[1];
        }
        // an event
        else {
            if (event.type === 'touchend') {
                if (event.touches.length === 1) {
                    touches[0] = event.touches[0];
                    touches[1] = event.changedTouches[0];
                }
                else if (event.touches.length === 0) {
                    touches[0] = event.changedTouches[0];
                    touches[1] = event.changedTouches[1];
                }
            }
            else {
                touches[0] = event.touches[0];
                touches[1] = event.touches[1];
            }
        }

        return touches;
    }

    function pointerAverage (pointers) {
        var average = {
            pageX  : 0,
            pageY  : 0,
            clientX: 0,
            clientY: 0,
            screenX: 0,
            screenY: 0
        };
        var prop;

        for (var i = 0; i < pointers.length; i++) {
            for (prop in average) {
                average[prop] += pointers[i][prop];
            }
        }
        for (prop in average) {
            average[prop] /= pointers.length;
        }

        return average;
    }

    function touchBBox (event) {
        if (!event.length && !(event.touches && event.touches.length > 1)) {
            return;
        }

        var touches = getTouchPair(event),
            minX = Math.min(touches[0].pageX, touches[1].pageX),
            minY = Math.min(touches[0].pageY, touches[1].pageY),
            maxX = Math.max(touches[0].pageX, touches[1].pageX),
            maxY = Math.max(touches[0].pageY, touches[1].pageY);

        return {
            x: minX,
            y: minY,
            left: minX,
            top: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    function touchDistance (event, deltaSource) {
        deltaSource = deltaSource || defaultOptions.deltaSource;

        var sourceX = deltaSource + 'X',
            sourceY = deltaSource + 'Y',
            touches = getTouchPair(event);


        var dx = touches[0][sourceX] - touches[1][sourceX],
            dy = touches[0][sourceY] - touches[1][sourceY];

        return hypot(dx, dy);
    }

    function touchAngle (event, prevAngle, deltaSource) {
        deltaSource = deltaSource || defaultOptions.deltaSource;

        var sourceX = deltaSource + 'X',
            sourceY = deltaSource + 'Y',
            touches = getTouchPair(event),
            dx = touches[0][sourceX] - touches[1][sourceX],
            dy = touches[0][sourceY] - touches[1][sourceY],
            angle = 180 * Math.atan(dy / dx) / Math.PI;

        if (isNumber(prevAngle)) {
            var dr = angle - prevAngle,
                drClamped = dr % 360;

            if (drClamped > 315) {
                angle -= 360 + (angle / 360)|0 * 360;
            }
            else if (drClamped > 135) {
                angle -= 180 + (angle / 360)|0 * 360;
            }
            else if (drClamped < -315) {
                angle += 360 + (angle / 360)|0 * 360;
            }
            else if (drClamped < -135) {
                angle += 180 + (angle / 360)|0 * 360;
            }
        }

        return  angle;
    }

    function getOriginXY (interactable, element) {
        var origin = interactable
                ? interactable.options.origin
                : defaultOptions.origin;

        if (origin === 'parent') {
            origin = parentElement(element);
        }
        else if (origin === 'self') {
            origin = interactable.getRect(element);
        }
        else if (trySelector(origin)) {
            origin = closest(element, origin) || { x: 0, y: 0 };
        }

        if (isFunction(origin)) {
            origin = origin(interactable && element);
        }

        if (isElement(origin))  {
            origin = getElementRect(origin);
        }

        origin.x = ('x' in origin)? origin.x : origin.left;
        origin.y = ('y' in origin)? origin.y : origin.top;

        return origin;
    }

    // http://stackoverflow.com/a/5634528/2280888
    function _getQBezierValue(t, p1, p2, p3) {
        var iT = 1 - t;
        return iT * iT * p1 + 2 * iT * t * p2 + t * t * p3;
    }

    function getQuadraticCurvePoint(startX, startY, cpX, cpY, endX, endY, position) {
        return {
            x:  _getQBezierValue(position, startX, cpX, endX),
            y:  _getQBezierValue(position, startY, cpY, endY)
        };
    }

    // http://gizma.com/easing/
    function easeOutQuad (t, b, c, d) {
        t /= d;
        return -c * t*(t-2) + b;
    }

    function nodeContains (parent, child) {
        while (child) {
            if (child === parent) {
                return true;
            }

            child = child.parentNode;
        }

        return false;
    }

    function closest (child, selector) {
        var parent = parentElement(child);

        while (isElement(parent)) {
            if (matchesSelector(parent, selector)) { return parent; }

            parent = parentElement(parent);
        }

        return null;
    }

    function parentElement (node) {
        var parent = node.parentNode;

        if (isDocFrag(parent)) {
            // skip past #shado-root fragments
            while ((parent = parent.host) && isDocFrag(parent)) {}

            return parent;
        }

        return parent;
    }

    function inContext (interactable, element) {
        return interactable._context === element.ownerDocument
                || nodeContains(interactable._context, element);
    }

    function testIgnore (interactable, interactableElement, element) {
        var ignoreFrom = interactable.options.ignoreFrom;

        if (!ignoreFrom || !isElement(element)) { return false; }

        if (isString(ignoreFrom)) {
            return matchesUpTo(element, ignoreFrom, interactableElement);
        }
        else if (isElement(ignoreFrom)) {
            return nodeContains(ignoreFrom, element);
        }

        return false;
    }

    function testAllow (interactable, interactableElement, element) {
        var allowFrom = interactable.options.allowFrom;

        if (!allowFrom) { return true; }

        if (!isElement(element)) { return false; }

        if (isString(allowFrom)) {
            return matchesUpTo(element, allowFrom, interactableElement);
        }
        else if (isElement(allowFrom)) {
            return nodeContains(allowFrom, element);
        }

        return false;
    }

    function checkAxis (axis, interactable) {
        if (!interactable) { return false; }

        var thisAxis = interactable.options.drag.axis;

        return (axis === 'xy' || thisAxis === 'xy' || thisAxis === axis);
    }

    function checkSnap (interactable, action) {
        var options = interactable.options;

        if (/^resize/.test(action)) {
            action = 'resize';
        }

        return options[action].snap && options[action].snap.enabled;
    }

    function checkRestrict (interactable, action) {
        var options = interactable.options;

        if (/^resize/.test(action)) {
            action = 'resize';
        }

        return  options[action].restrict && options[action].restrict.enabled;
    }

    function checkAutoScroll (interactable, action) {
        var options = interactable.options;

        if (/^resize/.test(action)) {
            action = 'resize';
        }

        return  options[action].autoScroll && options[action].autoScroll.enabled;
    }

    function withinInteractionLimit (interactable, element, action) {
        var options = interactable.options,
            maxActions = options[action.name].max,
            maxPerElement = options[action.name].maxPerElement,
            activeInteractions = 0,
            targetCount = 0,
            targetElementCount = 0;

        for (var i = 0, len = interactions.length; i < len; i++) {
            var interaction = interactions[i],
                otherAction = interaction.prepared.name,
                active = interaction.interacting();

            if (!active) { continue; }

            activeInteractions++;

            if (activeInteractions >= maxInteractions) {
                return false;
            }

            if (interaction.target !== interactable) { continue; }

            targetCount += (otherAction === action.name)|0;

            if (targetCount >= maxActions) {
                return false;
            }

            if (interaction.element === element) {
                targetElementCount++;

                if (otherAction !== action.name || targetElementCount >= maxPerElement) {
                    return false;
                }
            }
        }

        return maxInteractions > 0;
    }

    // Test for the element that's "above" all other qualifiers
    function indexOfDeepestElement (elements) {
        var dropzone,
            deepestZone = elements[0],
            index = deepestZone? 0: -1,
            parent,
            deepestZoneParents = [],
            dropzoneParents = [],
            child,
            i,
            n;

        for (i = 1; i < elements.length; i++) {
            dropzone = elements[i];

            // an element might belong to multiple selector dropzones
            if (!dropzone || dropzone === deepestZone) {
                continue;
            }

            if (!deepestZone) {
                deepestZone = dropzone;
                index = i;
                continue;
            }

            // check if the deepest or current are document.documentElement or document.rootElement
            // - if the current dropzone is, do nothing and continue
            if (dropzone.parentNode === dropzone.ownerDocument) {
                continue;
            }
            // - if deepest is, update with the current dropzone and continue to next
            else if (deepestZone.parentNode === dropzone.ownerDocument) {
                deepestZone = dropzone;
                index = i;
                continue;
            }

            if (!deepestZoneParents.length) {
                parent = deepestZone;
                while (parent.parentNode && parent.parentNode !== parent.ownerDocument) {
                    deepestZoneParents.unshift(parent);
                    parent = parent.parentNode;
                }
            }

            // if this element is an svg element and the current deepest is
            // an HTMLElement
            if (deepestZone instanceof HTMLElement
                && dropzone instanceof SVGElement
                && !(dropzone instanceof SVGSVGElement)) {

                if (dropzone === deepestZone.parentNode) {
                    continue;
                }

                parent = dropzone.ownerSVGElement;
            }
            else {
                parent = dropzone;
            }

            dropzoneParents = [];

            while (parent.parentNode !== parent.ownerDocument) {
                dropzoneParents.unshift(parent);
                parent = parent.parentNode;
            }

            n = 0;

            // get (position of last common ancestor) + 1
            while (dropzoneParents[n] && dropzoneParents[n] === deepestZoneParents[n]) {
                n++;
            }

            var parents = [
                dropzoneParents[n - 1],
                dropzoneParents[n],
                deepestZoneParents[n]
            ];

            child = parents[0].lastChild;

            while (child) {
                if (child === parents[1]) {
                    deepestZone = dropzone;
                    index = i;
                    deepestZoneParents = [];

                    break;
                }
                else if (child === parents[2]) {
                    break;
                }

                child = child.previousSibling;
            }
        }

        return index;
    }

    function Interaction () {
        this.target          = null; // current interactable being interacted with
        this.element         = null; // the target element of the interactable
        this.dropTarget      = null; // the dropzone a drag target might be dropped into
        this.dropElement     = null; // the element at the time of checking
        this.prevDropTarget  = null; // the dropzone that was recently dragged away from
        this.prevDropElement = null; // the element at the time of checking

        this.prepared        = {     // action that's ready to be fired on next move event
            name : null,
            axis : null,
            edges: null
        };

        this.matches         = [];   // all selectors that are matched by target element
        this.matchElements   = [];   // corresponding elements

        this.inertiaStatus = {
            active       : false,
            smoothEnd    : false,
            ending       : false,

            startEvent: null,
            upCoords: {},

            xe: 0, ye: 0,
            sx: 0, sy: 0,

            t0: 0,
            vx0: 0, vys: 0,
            duration: 0,

            resumeDx: 0,
            resumeDy: 0,

            lambda_v0: 0,
            one_ve_v0: 0,
            i  : null
        };

        if (isFunction(Function.prototype.bind)) {
            this.boundInertiaFrame = this.inertiaFrame.bind(this);
            this.boundSmoothEndFrame = this.smoothEndFrame.bind(this);
        }
        else {
            var that = this;

            this.boundInertiaFrame = function () { return that.inertiaFrame(); };
            this.boundSmoothEndFrame = function () { return that.smoothEndFrame(); };
        }

        this.activeDrops = {
            dropzones: [],      // the dropzones that are mentioned below
            elements : [],      // elements of dropzones that accept the target draggable
            rects    : []       // the rects of the elements mentioned above
        };

        // keep track of added pointers
        this.pointers    = [];
        this.pointerIds  = [];
        this.downTargets = [];
        this.downTimes   = [];
        this.holdTimers  = [];

        // Previous native pointer move event coordinates
        this.prevCoords = {
            page     : { x: 0, y: 0 },
            client   : { x: 0, y: 0 },
            timeStamp: 0
        };
        // current native pointer move event coordinates
        this.curCoords = {
            page     : { x: 0, y: 0 },
            client   : { x: 0, y: 0 },
            timeStamp: 0
        };

        // Starting InteractEvent pointer coordinates
        this.startCoords = {
            page     : { x: 0, y: 0 },
            client   : { x: 0, y: 0 },
            timeStamp: 0
        };

        // Change in coordinates and time of the pointer
        this.pointerDelta = {
            page     : { x: 0, y: 0, vx: 0, vy: 0, speed: 0 },
            client   : { x: 0, y: 0, vx: 0, vy: 0, speed: 0 },
            timeStamp: 0
        };

        this.downEvent   = null;    // pointerdown/mousedown/touchstart event
        this.downPointer = {};

        this._eventTarget    = null;
        this._curEventTarget = null;

        this.prevEvent = null;      // previous action event
        this.tapTime   = 0;         // time of the most recent tap event
        this.prevTap   = null;

        this.startOffset    = { left: 0, right: 0, top: 0, bottom: 0 };
        this.restrictOffset = { left: 0, right: 0, top: 0, bottom: 0 };
        this.snapOffsets    = [];

        this.gesture = {
            start: { x: 0, y: 0 },

            startDistance: 0,   // distance between two touches of touchStart
            prevDistance : 0,
            distance     : 0,

            scale: 1,           // gesture.distance / gesture.startDistance

            startAngle: 0,      // angle of line joining two touches
            prevAngle : 0       // angle of the previous gesture event
        };

        this.snapStatus = {
            x       : 0, y       : 0,
            dx      : 0, dy      : 0,
            realX   : 0, realY   : 0,
            snappedX: 0, snappedY: 0,
            targets : [],
            locked  : false,
            changed : false
        };

        this.restrictStatus = {
            dx         : 0, dy         : 0,
            restrictedX: 0, restrictedY: 0,
            snap       : null,
            restricted : false,
            changed    : false
        };

        this.restrictStatus.snap = this.snapStatus;

        this.pointerIsDown   = false;
        this.pointerWasMoved = false;
        this.gesturing       = false;
        this.dragging        = false;
        this.resizing        = false;
        this.resizeAxes      = 'xy';

        this.mouse = false;

        interactions.push(this);
    }

    Interaction.prototype = {
        getPageXY  : function (pointer, xy) { return   getPageXY(pointer, xy, this); },
        getClientXY: function (pointer, xy) { return getClientXY(pointer, xy, this); },
        setEventXY : function (target, ptr) { return  setEventXY(target, ptr, this); },

        pointerOver: function (pointer, event, eventTarget) {
            if (this.prepared.name || !this.mouse) { return; }

            var curMatches = [],
                curMatchElements = [],
                prevTargetElement = this.element;

            this.addPointer(pointer);

            if (this.target
                && (testIgnore(this.target, this.element, eventTarget)
                    || !testAllow(this.target, this.element, eventTarget))) {
                // if the eventTarget should be ignored or shouldn't be allowed
                // clear the previous target
                this.target = null;
                this.element = null;
                this.matches = [];
                this.matchElements = [];
            }

            var elementInteractable = interactables.get(eventTarget),
                elementAction = (elementInteractable
                                 && !testIgnore(elementInteractable, eventTarget, eventTarget)
                                 && testAllow(elementInteractable, eventTarget, eventTarget)
                                 && validateAction(
                                     elementInteractable.getAction(pointer, event, this, eventTarget),
                                     elementInteractable));

            if (elementAction && !withinInteractionLimit(elementInteractable, eventTarget, elementAction)) {
                 elementAction = null;
            }

            function pushCurMatches (interactable, selector) {
                if (interactable
                    && inContext(interactable, eventTarget)
                    && !testIgnore(interactable, eventTarget, eventTarget)
                    && testAllow(interactable, eventTarget, eventTarget)
                    && matchesSelector(eventTarget, selector)) {

                    curMatches.push(interactable);
                    curMatchElements.push(eventTarget);
                }
            }

            if (elementAction) {
                this.target = elementInteractable;
                this.element = eventTarget;
                this.matches = [];
                this.matchElements = [];
            }
            else {
                interactables.forEachSelector(pushCurMatches);

                if (this.validateSelector(pointer, event, curMatches, curMatchElements)) {
                    this.matches = curMatches;
                    this.matchElements = curMatchElements;

                    this.pointerHover(pointer, event, this.matches, this.matchElements);
                    events.add(eventTarget,
                                        PointerEvent? pEventTypes.move : 'mousemove',
                                        listeners.pointerHover);
                }
                else if (this.target) {
                    if (nodeContains(prevTargetElement, eventTarget)) {
                        this.pointerHover(pointer, event, this.matches, this.matchElements);
                        events.add(this.element,
                                            PointerEvent? pEventTypes.move : 'mousemove',
                                            listeners.pointerHover);
                    }
                    else {
                        this.target = null;
                        this.element = null;
                        this.matches = [];
                        this.matchElements = [];
                    }
                }
            }
        },

        // Check what action would be performed on pointerMove target if a mouse
        // button were pressed and change the cursor accordingly
        pointerHover: function (pointer, event, eventTarget, curEventTarget, matches, matchElements) {
            var target = this.target;

            if (!this.prepared.name && this.mouse) {

                var action;

                // update pointer coords for defaultActionChecker to use
                this.setEventXY(this.curCoords, [pointer]);

                if (matches) {
                    action = this.validateSelector(pointer, event, matches, matchElements);
                }
                else if (target) {
                    action = validateAction(target.getAction(this.pointers[0], event, this, this.element), this.target);
                }

                if (target && target.options.styleCursor) {
                    if (action) {
                        target._doc.documentElement.style.cursor = getActionCursor(action);
                    }
                    else {
                        target._doc.documentElement.style.cursor = '';
                    }
                }
            }
            else if (this.prepared.name) {
                this.checkAndPreventDefault(event, target, this.element);
            }
        },

        pointerOut: function (pointer, event, eventTarget) {
            if (this.prepared.name) { return; }

            // Remove temporary event listeners for selector Interactables
            if (!interactables.get(eventTarget)) {
                events.remove(eventTarget,
                                       PointerEvent? pEventTypes.move : 'mousemove',
                                       listeners.pointerHover);
            }

            if (this.target && this.target.options.styleCursor && !this.interacting()) {
                this.target._doc.documentElement.style.cursor = '';
            }
        },

        selectorDown: function (pointer, event, eventTarget, curEventTarget) {
            var that = this,
                // copy event to be used in timeout for IE8
                eventCopy = events.useAttachEvent? extend({}, event) : event,
                element = eventTarget,
                pointerIndex = this.addPointer(pointer),
                action;

            this.holdTimers[pointerIndex] = setTimeout(function () {
                that.pointerHold(events.useAttachEvent? eventCopy : pointer, eventCopy, eventTarget, curEventTarget);
            }, defaultOptions._holdDuration);

            this.pointerIsDown = true;

            // Check if the down event hits the current inertia target
            if (this.inertiaStatus.active && this.target.selector) {
                // climb up the DOM tree from the event target
                while (isElement(element)) {

                    // if this element is the current inertia target element
                    if (element === this.element
                        // and the prospective action is the same as the ongoing one
                        && validateAction(this.target.getAction(pointer, event, this, this.element), this.target).name === this.prepared.name) {

                        // stop inertia so that the next move will be a normal one
                        cancelFrame(this.inertiaStatus.i);
                        this.inertiaStatus.active = false;

                        this.collectEventTargets(pointer, event, eventTarget, 'down');
                        return;
                    }
                    element = parentElement(element);
                }
            }

            // do nothing if interacting
            if (this.interacting()) {
                this.collectEventTargets(pointer, event, eventTarget, 'down');
                return;
            }

            function pushMatches (interactable, selector, context) {
                var elements = ie8MatchesSelector
                    ? context.querySelectorAll(selector)
                    : undefined;

                if (inContext(interactable, element)
                    && !testIgnore(interactable, element, eventTarget)
                    && testAllow(interactable, element, eventTarget)
                    && matchesSelector(element, selector, elements)) {

                    that.matches.push(interactable);
                    that.matchElements.push(element);
                }
            }

            // update pointer coords for defaultActionChecker to use
            this.setEventXY(this.curCoords, [pointer]);
            this.downEvent = event;

            while (isElement(element) && !action) {
                this.matches = [];
                this.matchElements = [];

                interactables.forEachSelector(pushMatches);

                action = this.validateSelector(pointer, event, this.matches, this.matchElements);
                element = parentElement(element);
            }

            if (action) {
                this.prepared.name  = action.name;
                this.prepared.axis  = action.axis;
                this.prepared.edges = action.edges;

                this.collectEventTargets(pointer, event, eventTarget, 'down');

                return this.pointerDown(pointer, event, eventTarget, curEventTarget, action);
            }
            else {
                // do these now since pointerDown isn't being called from here
                this.downTimes[pointerIndex] = new Date().getTime();
                this.downTargets[pointerIndex] = eventTarget;
                pointerExtend(this.downPointer, pointer);

                copyCoords(this.prevCoords, this.curCoords);
                this.pointerWasMoved = false;
            }

            this.collectEventTargets(pointer, event, eventTarget, 'down');
        },

        // Determine action to be performed on next pointerMove and add appropriate
        // style and event Listeners
        pointerDown: function (pointer, event, eventTarget, curEventTarget, forceAction) {
            if (!forceAction && !this.inertiaStatus.active && this.pointerWasMoved && this.prepared.name) {
                this.checkAndPreventDefault(event, this.target, this.element);

                return;
            }

            this.pointerIsDown = true;
            this.downEvent = event;

            var pointerIndex = this.addPointer(pointer),
                action;

            // If it is the second touch of a multi-touch gesture, keep the
            // target the same and get a new action if a target was set by the
            // first touch
            if (this.pointerIds.length > 1 && this.target._element === this.element) {
                var newAction = validateAction(forceAction || this.target.getAction(pointer, event, this, this.element), this.target);

                if (withinInteractionLimit(this.target, this.element, newAction)) {
                    action = newAction;
                }

                this.prepared.name = null;
            }
            // Otherwise, set the target if there is no action prepared
            else if (!this.prepared.name) {
                var interactable = interactables.get(curEventTarget);

                if (interactable
                    && !testIgnore(interactable, curEventTarget, eventTarget)
                    && testAllow(interactable, curEventTarget, eventTarget)
                    && (action = validateAction(forceAction || interactable.getAction(pointer, event, this, curEventTarget), interactable, eventTarget))
                    && withinInteractionLimit(interactable, curEventTarget, action)) {
                    this.target = interactable;
                    this.element = curEventTarget;
                }
            }

            var target = this.target,
                options = target && target.options;

            if (target && (forceAction || !this.prepared.name)) {
                action = action || validateAction(forceAction || target.getAction(pointer, event, this, curEventTarget), target, this.element);

                this.setEventXY(this.startCoords, this.pointers);

                if (!action) { return; }

                if (options.styleCursor) {
                    target._doc.documentElement.style.cursor = getActionCursor(action);
                }

                this.resizeAxes = action.name === 'resize'? action.axis : null;

                if (action === 'gesture' && this.pointerIds.length < 2) {
                    action = null;
                }

                this.prepared.name  = action.name;
                this.prepared.axis  = action.axis;
                this.prepared.edges = action.edges;

                this.snapStatus.snappedX = this.snapStatus.snappedY =
                    this.restrictStatus.restrictedX = this.restrictStatus.restrictedY = NaN;

                this.downTimes[pointerIndex] = new Date().getTime();
                this.downTargets[pointerIndex] = eventTarget;
                pointerExtend(this.downPointer, pointer);

                copyCoords(this.prevCoords, this.startCoords);
                this.pointerWasMoved = false;

                this.checkAndPreventDefault(event, target, this.element);
            }
            // if inertia is active try to resume action
            else if (this.inertiaStatus.active
                && curEventTarget === this.element
                && validateAction(target.getAction(pointer, event, this, this.element), target).name === this.prepared.name) {

                cancelFrame(this.inertiaStatus.i);
                this.inertiaStatus.active = false;

                this.checkAndPreventDefault(event, target, this.element);
            }
        },

        setModifications: function (coords, preEnd) {
            var target         = this.target,
                shouldMove     = true,
                shouldSnap     = checkSnap(target, this.prepared.name)     && (!target.options[this.prepared.name].snap.endOnly     || preEnd),
                shouldRestrict = checkRestrict(target, this.prepared.name) && (!target.options[this.prepared.name].restrict.endOnly || preEnd);

            if (shouldSnap    ) { this.setSnapping   (coords); } else { this.snapStatus    .locked     = false; }
            if (shouldRestrict) { this.setRestriction(coords); } else { this.restrictStatus.restricted = false; }

            if (shouldSnap && this.snapStatus.locked && !this.snapStatus.changed) {
                shouldMove = shouldRestrict && this.restrictStatus.restricted && this.restrictStatus.changed;
            }
            else if (shouldRestrict && this.restrictStatus.restricted && !this.restrictStatus.changed) {
                shouldMove = false;
            }

            return shouldMove;
        },

        setStartOffsets: function (action, interactable, element) {
            var rect = interactable.getRect(element),
                origin = getOriginXY(interactable, element),
                snap = interactable.options[this.prepared.name].snap,
                restrict = interactable.options[this.prepared.name].restrict,
                width, height;

            if (rect) {
                this.startOffset.left = this.startCoords.page.x - rect.left;
                this.startOffset.top  = this.startCoords.page.y - rect.top;

                this.startOffset.right  = rect.right  - this.startCoords.page.x;
                this.startOffset.bottom = rect.bottom - this.startCoords.page.y;

                if ('width' in rect) { width = rect.width; }
                else { width = rect.right - rect.left; }
                if ('height' in rect) { height = rect.height; }
                else { height = rect.bottom - rect.top; }
            }
            else {
                this.startOffset.left = this.startOffset.top = this.startOffset.right = this.startOffset.bottom = 0;
            }

            this.snapOffsets.splice(0);

            var snapOffset = snap && snap.offset === 'startCoords'
                                ? {
                                    x: this.startCoords.page.x - origin.x,
                                    y: this.startCoords.page.y - origin.y
                                }
                                : snap && snap.offset || { x: 0, y: 0 };

            if (rect && snap && snap.relativePoints && snap.relativePoints.length) {
                for (var i = 0; i < snap.relativePoints.length; i++) {
                    this.snapOffsets.push({
                        x: this.startOffset.left - (width  * snap.relativePoints[i].x) + snapOffset.x,
                        y: this.startOffset.top  - (height * snap.relativePoints[i].y) + snapOffset.y
                    });
                }
            }
            else {
                this.snapOffsets.push(snapOffset);
            }

            if (rect && restrict.elementRect) {
                this.restrictOffset.left = this.startOffset.left - (width  * restrict.elementRect.left);
                this.restrictOffset.top  = this.startOffset.top  - (height * restrict.elementRect.top);

                this.restrictOffset.right  = this.startOffset.right  - (width  * (1 - restrict.elementRect.right));
                this.restrictOffset.bottom = this.startOffset.bottom - (height * (1 - restrict.elementRect.bottom));
            }
            else {
                this.restrictOffset.left = this.restrictOffset.top = this.restrictOffset.right = this.restrictOffset.bottom = 0;
            }
        },

        /*\
         * Interaction.start
         [ method ]
         *
         * Start an action with the given Interactable and Element as tartgets. The
         * action must be enabled for the target Interactable and an appropriate number
         * of pointers must be held down – 1 for drag/resize, 2 for gesture.
         *
         * Use it with `interactable.<action>able({ manualStart: false })` to always
         * [start actions manually](https://github.com/taye/interact.js/issues/114)
         *
         - action       (object)  The action to be performed - drag, resize, etc.
         - interactable (Interactable) The Interactable to target
         - element      (Element) The DOM Element to target
         = (object) interact
         **
         | interact(target)
         |   .draggable({
         |     // disable the default drag start by down->move
         |     manualStart: true
         |   })
         |   // start dragging after the user holds the pointer down
         |   .on('hold', function (event) {
         |     var interaction = event.interaction;
         |
         |     if (!interaction.interacting()) {
         |       interaction.start({ name: 'drag' },
         |                         event.interactable,
         |                         event.currentTarget);
         |     }
         | });
        \*/
        start: function (action, interactable, element) {
            if (this.interacting()
                || !this.pointerIsDown
                || this.pointerIds.length < (action.name === 'gesture'? 2 : 1)) {
                return;
            }

            // if this interaction had been removed after stopping
            // add it back
            if (indexOf(interactions, this) === -1) {
                interactions.push(this);
            }

            // set the startCoords if there was no prepared action
            if (!this.prepared.name) {
                this.setEventXY(this.startCoords);
            }

            this.prepared.name  = action.name;
            this.prepared.axis  = action.axis;
            this.prepared.edges = action.edges;
            this.target         = interactable;
            this.element        = element;

            this.setStartOffsets(action.name, interactable, element);
            this.setModifications(this.startCoords.page);

            this.prevEvent = this[this.prepared.name + 'Start'](this.downEvent);
        },

        pointerMove: function (pointer, event, eventTarget, curEventTarget, preEnd) {
            if (this.inertiaStatus.active) {
                var pageUp   = this.inertiaStatus.upCoords.page;
                var clientUp = this.inertiaStatus.upCoords.client;

                var inertiaPosition = {
                    pageX  : pageUp.x   + this.inertiaStatus.sx,
                    pageY  : pageUp.y   + this.inertiaStatus.sy,
                    clientX: clientUp.x + this.inertiaStatus.sx,
                    clientY: clientUp.y + this.inertiaStatus.sy
                };

                this.setEventXY(this.curCoords, [inertiaPosition]);
            }
            else {
                this.recordPointer(pointer);
                this.setEventXY(this.curCoords, this.pointers);
            }

            var duplicateMove = (this.curCoords.page.x === this.prevCoords.page.x
                                 && this.curCoords.page.y === this.prevCoords.page.y
                                 && this.curCoords.client.x === this.prevCoords.client.x
                                 && this.curCoords.client.y === this.prevCoords.client.y);

            var dx, dy,
                pointerIndex = this.mouse? 0 : indexOf(this.pointerIds, getPointerId(pointer));

            // register movement greater than pointerMoveTolerance
            if (this.pointerIsDown && !this.pointerWasMoved) {
                dx = this.curCoords.client.x - this.startCoords.client.x;
                dy = this.curCoords.client.y - this.startCoords.client.y;

                this.pointerWasMoved = hypot(dx, dy) > pointerMoveTolerance;
            }

            if (!duplicateMove && (!this.pointerIsDown || this.pointerWasMoved)) {
                if (this.pointerIsDown) {
                    clearTimeout(this.holdTimers[pointerIndex]);
                }

                this.collectEventTargets(pointer, event, eventTarget, 'move');
            }

            if (!this.pointerIsDown) { return; }

            if (duplicateMove && this.pointerWasMoved && !preEnd) {
                this.checkAndPreventDefault(event, this.target, this.element);
                return;
            }

            // set pointer coordinate, time changes and speeds
            setEventDeltas(this.pointerDelta, this.prevCoords, this.curCoords);

            if (!this.prepared.name) { return; }

            if (this.pointerWasMoved
                // ignore movement while inertia is active
                && (!this.inertiaStatus.active || (pointer instanceof InteractEvent && /inertiastart/.test(pointer.type)))) {

                // if just starting an action, calculate the pointer speed now
                if (!this.interacting()) {
                    setEventDeltas(this.pointerDelta, this.prevCoords, this.curCoords);

                    // check if a drag is in the correct axis
                    if (this.prepared.name === 'drag') {
                        var absX = Math.abs(dx),
                            absY = Math.abs(dy),
                            targetAxis = this.target.options.drag.axis,
                            axis = (absX > absY ? 'x' : absX < absY ? 'y' : 'xy');

                        // if the movement isn't in the axis of the interactable
                        if (axis !== 'xy' && targetAxis !== 'xy' && targetAxis !== axis) {
                            // cancel the prepared action
                            this.prepared.name = null;

                            // then try to get a drag from another ineractable

                            var element = eventTarget;

                            // check element interactables
                            while (isElement(element)) {
                                var elementInteractable = interactables.get(element);

                                if (elementInteractable
                                    && elementInteractable !== this.target
                                    && !elementInteractable.options.drag.manualStart
                                    && elementInteractable.getAction(this.downPointer, this.downEvent, this, element).name === 'drag'
                                    && checkAxis(axis, elementInteractable)) {

                                    this.prepared.name = 'drag';
                                    this.target = elementInteractable;
                                    this.element = element;
                                    break;
                                }

                                element = parentElement(element);
                            }

                            // if there's no drag from element interactables,
                            // check the selector interactables
                            if (!this.prepared.name) {
                                var thisInteraction = this;

                                var getDraggable = function (interactable, selector, context) {
                                    var elements = ie8MatchesSelector
                                        ? context.querySelectorAll(selector)
                                        : undefined;

                                    if (interactable === thisInteraction.target) { return; }

                                    if (inContext(interactable, eventTarget)
                                        && !interactable.options.drag.manualStart
                                        && !testIgnore(interactable, element, eventTarget)
                                        && testAllow(interactable, element, eventTarget)
                                        && matchesSelector(element, selector, elements)
                                        && interactable.getAction(thisInteraction.downPointer, thisInteraction.downEvent, thisInteraction, element).name === 'drag'
                                        && checkAxis(axis, interactable)
                                        && withinInteractionLimit(interactable, element, 'drag')) {

                                        return interactable;
                                    }
                                };

                                element = eventTarget;

                                while (isElement(element)) {
                                    var selectorInteractable = interactables.forEachSelector(getDraggable);

                                    if (selectorInteractable) {
                                        this.prepared.name = 'drag';
                                        this.target = selectorInteractable;
                                        this.element = element;
                                        break;
                                    }

                                    element = parentElement(element);
                                }
                            }
                        }
                    }
                }

                var starting = !!this.prepared.name && !this.interacting();

                if (starting
                    && (this.target.options[this.prepared.name].manualStart
                        || !withinInteractionLimit(this.target, this.element, this.prepared))) {
                    this.stop(event);
                    return;
                }

                if (this.prepared.name && this.target) {
                    if (starting) {
                        this.start(this.prepared, this.target, this.element);
                    }

                    var shouldMove = this.setModifications(this.curCoords.page, preEnd);

                    // move if snapping or restriction doesn't prevent it
                    if (shouldMove || starting) {
                        this.prevEvent = this[this.prepared.name + 'Move'](event);
                    }

                    this.checkAndPreventDefault(event, this.target, this.element);
                }
            }

            copyCoords(this.prevCoords, this.curCoords);

            if (this.dragging || this.resizing) {
                this.autoScrollMove(pointer);
            }
        },

        dragStart: function (event) {
            var dragEvent = new InteractEvent(this, event, 'drag', 'start', this.element);

            this.dragging = true;
            this.target.fire(dragEvent);

            // reset active dropzones
            this.activeDrops.dropzones = [];
            this.activeDrops.elements  = [];
            this.activeDrops.rects     = [];

            if (!this.dynamicDrop) {
                this.setActiveDrops(this.element);
            }

            var dropEvents = this.getDropEvents(event, dragEvent);

            if (dropEvents.activate) {
                this.fireActiveDrops(dropEvents.activate);
            }

            return dragEvent;
        },

        dragMove: function (event) {
            var target = this.target,
                dragEvent  = new InteractEvent(this, event, 'drag', 'move', this.element),
                draggableElement = this.element,
                drop = this.getDrop(dragEvent, event, draggableElement);

            this.dropTarget = drop.dropzone;
            this.dropElement = drop.element;

            var dropEvents = this.getDropEvents(event, dragEvent);

            target.fire(dragEvent);

            if (dropEvents.leave) { this.prevDropTarget.fire(dropEvents.leave); }
            if (dropEvents.enter) {     this.dropTarget.fire(dropEvents.enter); }
            if (dropEvents.move ) {     this.dropTarget.fire(dropEvents.move ); }

            this.prevDropTarget  = this.dropTarget;
            this.prevDropElement = this.dropElement;

            return dragEvent;
        },

        resizeStart: function (event) {
            var resizeEvent = new InteractEvent(this, event, 'resize', 'start', this.element);

            if (this.prepared.edges) {
                var startRect = this.target.getRect(this.element);

                /*
                 * When using the `resizable.square` or `resizable.preserveAspectRatio` options, resizing from one edge
                 * will affect another. E.g. with `resizable.square`, resizing to make the right edge larger will make
                 * the bottom edge larger by the same amount. We call these 'linked' edges. Any linked edges will depend
                 * on the active edges and the edge being interacted with.
                 */
                if (this.target.options.resize.square || this.target.options.resize.preserveAspectRatio) {
                    var linkedEdges = extend({}, this.prepared.edges);

                    linkedEdges.top    = linkedEdges.top    || (linkedEdges.left   && !linkedEdges.bottom);
                    linkedEdges.left   = linkedEdges.left   || (linkedEdges.top    && !linkedEdges.right );
                    linkedEdges.bottom = linkedEdges.bottom || (linkedEdges.right  && !linkedEdges.top   );
                    linkedEdges.right  = linkedEdges.right  || (linkedEdges.bottom && !linkedEdges.left  );

                    this.prepared._linkedEdges = linkedEdges;
                }
                else {
                    this.prepared._linkedEdges = null;
                }

                // if using `resizable.preserveAspectRatio` option, record aspect ratio at the start of the resize
                if (this.target.options.resize.preserveAspectRatio) {
                    this.resizeStartAspectRatio = startRect.width / startRect.height;
                }

                this.resizeRects = {
                    start     : startRect,
                    current   : extend({}, startRect),
                    restricted: extend({}, startRect),
                    previous  : extend({}, startRect),
                    delta     : {
                        left: 0, right : 0, width : 0,
                        top : 0, bottom: 0, height: 0
                    }
                };

                resizeEvent.rect = this.resizeRects.restricted;
                resizeEvent.deltaRect = this.resizeRects.delta;
            }

            this.target.fire(resizeEvent);

            this.resizing = true;

            return resizeEvent;
        },

        resizeMove: function (event) {
            var resizeEvent = new InteractEvent(this, event, 'resize', 'move', this.element);

            var edges = this.prepared.edges,
                invert = this.target.options.resize.invert,
                invertible = invert === 'reposition' || invert === 'negate';

            if (edges) {
                var dx = resizeEvent.dx,
                    dy = resizeEvent.dy,

                    start      = this.resizeRects.start,
                    current    = this.resizeRects.current,
                    restricted = this.resizeRects.restricted,
                    delta      = this.resizeRects.delta,
                    previous   = extend(this.resizeRects.previous, restricted),

                    originalEdges = edges;

                // `resize.preserveAspectRatio` takes precedence over `resize.square`
                if (this.target.options.resize.preserveAspectRatio) {
                    var resizeStartAspectRatio = this.resizeStartAspectRatio;

                    edges = this.prepared._linkedEdges;

                    if ((originalEdges.left && originalEdges.bottom)
                        || (originalEdges.right && originalEdges.top)) {
                        dy = -dx / resizeStartAspectRatio;
                    }
                    else if (originalEdges.left || originalEdges.right) { dy = dx / resizeStartAspectRatio; }
                    else if (originalEdges.top || originalEdges.bottom) { dx = dy * resizeStartAspectRatio; }
                }
                else if (this.target.options.resize.square) {
                    edges = this.prepared._linkedEdges;

                    if ((originalEdges.left && originalEdges.bottom)
                        || (originalEdges.right && originalEdges.top)) {
                        dy = -dx;
                    }
                    else if (originalEdges.left || originalEdges.right) { dy = dx; }
                    else if (originalEdges.top || originalEdges.bottom) { dx = dy; }
                }

                // update the 'current' rect without modifications
                if (edges.top   ) { current.top    += dy; }
                if (edges.bottom) { current.bottom += dy; }
                if (edges.left  ) { current.left   += dx; }
                if (edges.right ) { current.right  += dx; }

                if (invertible) {
                    // if invertible, copy the current rect
                    extend(restricted, current);

                    if (invert === 'reposition') {
                        // swap edge values if necessary to keep width/height positive
                        var swap;

                        if (restricted.top > restricted.bottom) {
                            swap = restricted.top;

                            restricted.top = restricted.bottom;
                            restricted.bottom = swap;
                        }
                        if (restricted.left > restricted.right) {
                            swap = restricted.left;

                            restricted.left = restricted.right;
                            restricted.right = swap;
                        }
                    }
                }
                else {
                    // if not invertible, restrict to minimum of 0x0 rect
                    restricted.top    = Math.min(current.top, start.bottom);
                    restricted.bottom = Math.max(current.bottom, start.top);
                    restricted.left   = Math.min(current.left, start.right);
                    restricted.right  = Math.max(current.right, start.left);
                }

                restricted.width  = restricted.right  - restricted.left;
                restricted.height = restricted.bottom - restricted.top ;

                for (var edge in restricted) {
                    delta[edge] = restricted[edge] - previous[edge];
                }

                resizeEvent.edges = this.prepared.edges;
                resizeEvent.rect = restricted;
                resizeEvent.deltaRect = delta;
            }

            this.target.fire(resizeEvent);

            return resizeEvent;
        },

        gestureStart: function (event) {
            var gestureEvent = new InteractEvent(this, event, 'gesture', 'start', this.element);

            gestureEvent.ds = 0;

            this.gesture.startDistance = this.gesture.prevDistance = gestureEvent.distance;
            this.gesture.startAngle = this.gesture.prevAngle = gestureEvent.angle;
            this.gesture.scale = 1;

            this.gesturing = true;

            this.target.fire(gestureEvent);

            return gestureEvent;
        },

        gestureMove: function (event) {
            if (!this.pointerIds.length) {
                return this.prevEvent;
            }

            var gestureEvent;

            gestureEvent = new InteractEvent(this, event, 'gesture', 'move', this.element);
            gestureEvent.ds = gestureEvent.scale - this.gesture.scale;

            this.target.fire(gestureEvent);

            this.gesture.prevAngle = gestureEvent.angle;
            this.gesture.prevDistance = gestureEvent.distance;

            if (gestureEvent.scale !== Infinity &&
                gestureEvent.scale !== null &&
                gestureEvent.scale !== undefined  &&
                !isNaN(gestureEvent.scale)) {

                this.gesture.scale = gestureEvent.scale;
            }

            return gestureEvent;
        },

        pointerHold: function (pointer, event, eventTarget) {
            this.collectEventTargets(pointer, event, eventTarget, 'hold');
        },

        pointerUp: function (pointer, event, eventTarget, curEventTarget) {
            var pointerIndex = this.mouse? 0 : indexOf(this.pointerIds, getPointerId(pointer));

            clearTimeout(this.holdTimers[pointerIndex]);

            this.collectEventTargets(pointer, event, eventTarget, 'up' );
            this.collectEventTargets(pointer, event, eventTarget, 'tap');

            this.pointerEnd(pointer, event, eventTarget, curEventTarget);

            this.removePointer(pointer);
        },

        pointerCancel: function (pointer, event, eventTarget, curEventTarget) {
            var pointerIndex = this.mouse? 0 : indexOf(this.pointerIds, getPointerId(pointer));

            clearTimeout(this.holdTimers[pointerIndex]);

            this.collectEventTargets(pointer, event, eventTarget, 'cancel');
            this.pointerEnd(pointer, event, eventTarget, curEventTarget);

            this.removePointer(pointer);
        },

        // http://www.quirksmode.org/dom/events/click.html
        // >Events leading to dblclick
        //
        // IE8 doesn't fire down event before dblclick.
        // This workaround tries to fire a tap and doubletap after dblclick
        ie8Dblclick: function (pointer, event, eventTarget) {
            if (this.prevTap
                && event.clientX === this.prevTap.clientX
                && event.clientY === this.prevTap.clientY
                && eventTarget   === this.prevTap.target) {

                this.downTargets[0] = eventTarget;
                this.downTimes[0] = new Date().getTime();
                this.collectEventTargets(pointer, event, eventTarget, 'tap');
            }
        },

        // End interact move events and stop auto-scroll unless inertia is enabled
        pointerEnd: function (pointer, event, eventTarget, curEventTarget) {
            var endEvent,
                target = this.target,
                options = target && target.options,
                inertiaOptions = options && this.prepared.name && options[this.prepared.name].inertia,
                inertiaStatus = this.inertiaStatus;

            if (this.interacting()) {

                if (inertiaStatus.active && !inertiaStatus.ending) { return; }

                var pointerSpeed,
                    now = new Date().getTime(),
                    inertiaPossible = false,
                    inertia = false,
                    smoothEnd = false,
                    endSnap = checkSnap(target, this.prepared.name) && options[this.prepared.name].snap.endOnly,
                    endRestrict = checkRestrict(target, this.prepared.name) && options[this.prepared.name].restrict.endOnly,
                    dx = 0,
                    dy = 0,
                    startEvent;

                if (this.dragging) {
                    if      (options.drag.axis === 'x' ) { pointerSpeed = Math.abs(this.pointerDelta.client.vx); }
                    else if (options.drag.axis === 'y' ) { pointerSpeed = Math.abs(this.pointerDelta.client.vy); }
                    else   /*options.drag.axis === 'xy'*/{ pointerSpeed = this.pointerDelta.client.speed; }
                }
                else {
                    pointerSpeed = this.pointerDelta.client.speed;
                }

                // check if inertia should be started
                inertiaPossible = (inertiaOptions && inertiaOptions.enabled
                                   && this.prepared.name !== 'gesture'
                                   && event !== inertiaStatus.startEvent);

                inertia = (inertiaPossible
                           && (now - this.curCoords.timeStamp) < 50
                           && pointerSpeed > inertiaOptions.minSpeed
                           && pointerSpeed > inertiaOptions.endSpeed);

                if (inertiaPossible && !inertia && (endSnap || endRestrict)) {

                    var snapRestrict = {};

                    snapRestrict.snap = snapRestrict.restrict = snapRestrict;

                    if (endSnap) {
                        this.setSnapping(this.curCoords.page, snapRestrict);
                        if (snapRestrict.locked) {
                            dx += snapRestrict.dx;
                            dy += snapRestrict.dy;
                        }
                    }

                    if (endRestrict) {
                        this.setRestriction(this.curCoords.page, snapRestrict);
                        if (snapRestrict.restricted) {
                            dx += snapRestrict.dx;
                            dy += snapRestrict.dy;
                        }
                    }

                    if (dx || dy) {
                        smoothEnd = true;
                    }
                }

                if (inertia || smoothEnd) {
                    copyCoords(inertiaStatus.upCoords, this.curCoords);

                    this.pointers[0] = inertiaStatus.startEvent = startEvent =
                        new InteractEvent(this, event, this.prepared.name, 'inertiastart', this.element);

                    inertiaStatus.t0 = now;

                    target.fire(inertiaStatus.startEvent);

                    if (inertia) {
                        inertiaStatus.vx0 = this.pointerDelta.client.vx;
                        inertiaStatus.vy0 = this.pointerDelta.client.vy;
                        inertiaStatus.v0 = pointerSpeed;

                        this.calcInertia(inertiaStatus);

                        var page = extend({}, this.curCoords.page),
                            origin = getOriginXY(target, this.element),
                            statusObject;

                        page.x = page.x + inertiaStatus.xe - origin.x;
                        page.y = page.y + inertiaStatus.ye - origin.y;

                        statusObject = {
                            useStatusXY: true,
                            x: page.x,
                            y: page.y,
                            dx: 0,
                            dy: 0,
                            snap: null
                        };

                        statusObject.snap = statusObject;

                        dx = dy = 0;

                        if (endSnap) {
                            var snap = this.setSnapping(this.curCoords.page, statusObject);

                            if (snap.locked) {
                                dx += snap.dx;
                                dy += snap.dy;
                            }
                        }

                        if (endRestrict) {
                            var restrict = this.setRestriction(this.curCoords.page, statusObject);

                            if (restrict.restricted) {
                                dx += restrict.dx;
                                dy += restrict.dy;
                            }
                        }

                        inertiaStatus.modifiedXe += dx;
                        inertiaStatus.modifiedYe += dy;

                        inertiaStatus.i = reqFrame(this.boundInertiaFrame);
                    }
                    else {
                        inertiaStatus.smoothEnd = true;
                        inertiaStatus.xe = dx;
                        inertiaStatus.ye = dy;

                        inertiaStatus.sx = inertiaStatus.sy = 0;

                        inertiaStatus.i = reqFrame(this.boundSmoothEndFrame);
                    }

                    inertiaStatus.active = true;
                    return;
                }

                if (endSnap || endRestrict) {
                    // fire a move event at the snapped coordinates
                    this.pointerMove(pointer, event, eventTarget, curEventTarget, true);
                }
            }

            if (this.dragging) {
                endEvent = new InteractEvent(this, event, 'drag', 'end', this.element);

                var draggableElement = this.element,
                    drop = this.getDrop(endEvent, event, draggableElement);

                this.dropTarget = drop.dropzone;
                this.dropElement = drop.element;

                var dropEvents = this.getDropEvents(event, endEvent);

                if (dropEvents.leave) { this.prevDropTarget.fire(dropEvents.leave); }
                if (dropEvents.enter) {     this.dropTarget.fire(dropEvents.enter); }
                if (dropEvents.drop ) {     this.dropTarget.fire(dropEvents.drop ); }
                if (dropEvents.deactivate) {
                    this.fireActiveDrops(dropEvents.deactivate);
                }

                target.fire(endEvent);
            }
            else if (this.resizing) {
                endEvent = new InteractEvent(this, event, 'resize', 'end', this.element);
                target.fire(endEvent);
            }
            else if (this.gesturing) {
                endEvent = new InteractEvent(this, event, 'gesture', 'end', this.element);
                target.fire(endEvent);
            }

            this.stop(event);
        },

        collectDrops: function (element) {
            var drops = [],
                elements = [],
                i;

            element = element || this.element;

            // collect all dropzones and their elements which qualify for a drop
            for (i = 0; i < interactables.length; i++) {
                if (!interactables[i].options.drop.enabled) { continue; }

                var current = interactables[i],
                    accept = current.options.drop.accept;

                // test the draggable element against the dropzone's accept setting
                if ((isElement(accept) && accept !== element)
                    || (isString(accept)
                        && !matchesSelector(element, accept))) {

                    continue;
                }

                // query for new elements if necessary
                var dropElements = current.selector? current._context.querySelectorAll(current.selector) : [current._element];

                for (var j = 0, len = dropElements.length; j < len; j++) {
                    var currentElement = dropElements[j];

                    if (currentElement === element) {
                        continue;
                    }

                    drops.push(current);
                    elements.push(currentElement);
                }
            }

            return {
                dropzones: drops,
                elements: elements
            };
        },

        fireActiveDrops: function (event) {
            var i,
                current,
                currentElement,
                prevElement;

            // loop through all active dropzones and trigger event
            for (i = 0; i < this.activeDrops.dropzones.length; i++) {
                current = this.activeDrops.dropzones[i];
                currentElement = this.activeDrops.elements [i];

                // prevent trigger of duplicate events on same element
                if (currentElement !== prevElement) {
                    // set current element as event target
                    event.target = currentElement;
                    current.fire(event);
                }
                prevElement = currentElement;
            }
        },

        // Collect a new set of possible drops and save them in activeDrops.
        // setActiveDrops should always be called when a drag has just started or a
        // drag event happens while dynamicDrop is true
        setActiveDrops: function (dragElement) {
            // get dropzones and their elements that could receive the draggable
            var possibleDrops = this.collectDrops(dragElement, true);

            this.activeDrops.dropzones = possibleDrops.dropzones;
            this.activeDrops.elements  = possibleDrops.elements;
            this.activeDrops.rects     = [];

            for (var i = 0; i < this.activeDrops.dropzones.length; i++) {
                this.activeDrops.rects[i] = this.activeDrops.dropzones[i].getRect(this.activeDrops.elements[i]);
            }
        },

        getDrop: function (dragEvent, event, dragElement) {
            var validDrops = [];

            if (dynamicDrop) {
                this.setActiveDrops(dragElement);
            }

            // collect all dropzones and their elements which qualify for a drop
            for (var j = 0; j < this.activeDrops.dropzones.length; j++) {
                var current        = this.activeDrops.dropzones[j],
                    currentElement = this.activeDrops.elements [j],
                    rect           = this.activeDrops.rects    [j];

                validDrops.push(current.dropCheck(dragEvent, event, this.target, dragElement, currentElement, rect)
                                ? currentElement
                                : null);
            }

            // get the most appropriate dropzone based on DOM depth and order
            var dropIndex = indexOfDeepestElement(validDrops),
                dropzone  = this.activeDrops.dropzones[dropIndex] || null,
                element   = this.activeDrops.elements [dropIndex] || null;

            return {
                dropzone: dropzone,
                element: element
            };
        },

        getDropEvents: function (pointerEvent, dragEvent) {
            var dropEvents = {
                enter     : null,
                leave     : null,
                activate  : null,
                deactivate: null,
                move      : null,
                drop      : null
            };

            if (this.dropElement !== this.prevDropElement) {
                // if there was a prevDropTarget, create a dragleave event
                if (this.prevDropTarget) {
                    dropEvents.leave = {
                        target       : this.prevDropElement,
                        dropzone     : this.prevDropTarget,
                        relatedTarget: dragEvent.target,
                        draggable    : dragEvent.interactable,
                        dragEvent    : dragEvent,
                        interaction  : this,
                        timeStamp    : dragEvent.timeStamp,
                        type         : 'dragleave'
                    };

                    dragEvent.dragLeave = this.prevDropElement;
                    dragEvent.prevDropzone = this.prevDropTarget;
                }
                // if the dropTarget is not null, create a dragenter event
                if (this.dropTarget) {
                    dropEvents.enter = {
                        target       : this.dropElement,
                        dropzone     : this.dropTarget,
                        relatedTarget: dragEvent.target,
                        draggable    : dragEvent.interactable,
                        dragEvent    : dragEvent,
                        interaction  : this,
                        timeStamp    : dragEvent.timeStamp,
                        type         : 'dragenter'
                    };

                    dragEvent.dragEnter = this.dropElement;
                    dragEvent.dropzone = this.dropTarget;
                }
            }

            if (dragEvent.type === 'dragend' && this.dropTarget) {
                dropEvents.drop = {
                    target       : this.dropElement,
                    dropzone     : this.dropTarget,
                    relatedTarget: dragEvent.target,
                    draggable    : dragEvent.interactable,
                    dragEvent    : dragEvent,
                    interaction  : this,
                    timeStamp    : dragEvent.timeStamp,
                    type         : 'drop'
                };

                dragEvent.dropzone = this.dropTarget;
            }
            if (dragEvent.type === 'dragstart') {
                dropEvents.activate = {
                    target       : null,
                    dropzone     : null,
                    relatedTarget: dragEvent.target,
                    draggable    : dragEvent.interactable,
                    dragEvent    : dragEvent,
                    interaction  : this,
                    timeStamp    : dragEvent.timeStamp,
                    type         : 'dropactivate'
                };
            }
            if (dragEvent.type === 'dragend') {
                dropEvents.deactivate = {
                    target       : null,
                    dropzone     : null,
                    relatedTarget: dragEvent.target,
                    draggable    : dragEvent.interactable,
                    dragEvent    : dragEvent,
                    interaction  : this,
                    timeStamp    : dragEvent.timeStamp,
                    type         : 'dropdeactivate'
                };
            }
            if (dragEvent.type === 'dragmove' && this.dropTarget) {
                dropEvents.move = {
                    target       : this.dropElement,
                    dropzone     : this.dropTarget,
                    relatedTarget: dragEvent.target,
                    draggable    : dragEvent.interactable,
                    dragEvent    : dragEvent,
                    interaction  : this,
                    dragmove     : dragEvent,
                    timeStamp    : dragEvent.timeStamp,
                    type         : 'dropmove'
                };
                dragEvent.dropzone = this.dropTarget;
            }

            return dropEvents;
        },

        currentAction: function () {
            return (this.dragging && 'drag') || (this.resizing && 'resize') || (this.gesturing && 'gesture') || null;
        },

        interacting: function () {
            return this.dragging || this.resizing || this.gesturing;
        },

        clearTargets: function () {
            this.target = this.element = null;

            this.dropTarget = this.dropElement = this.prevDropTarget = this.prevDropElement = null;
        },

        stop: function (event) {
            if (this.interacting()) {
                autoScroll.stop();
                this.matches = [];
                this.matchElements = [];

                var target = this.target;

                if (target.options.styleCursor) {
                    target._doc.documentElement.style.cursor = '';
                }

                // prevent Default only if were previously interacting
                if (event && isFunction(event.preventDefault)) {
                    this.checkAndPreventDefault(event, target, this.element);
                }

                if (this.dragging) {
                    this.activeDrops.dropzones = this.activeDrops.elements = this.activeDrops.rects = null;
                }
            }

            this.clearTargets();

            this.pointerIsDown = this.snapStatus.locked = this.dragging = this.resizing = this.gesturing = false;
            this.prepared.name = this.prevEvent = null;
            this.inertiaStatus.resumeDx = this.inertiaStatus.resumeDy = 0;

            // remove pointers if their ID isn't in this.pointerIds
            for (var i = 0; i < this.pointers.length; i++) {
                if (indexOf(this.pointerIds, getPointerId(this.pointers[i])) === -1) {
                    this.pointers.splice(i, 1);
                }
            }
        },

        inertiaFrame: function () {
            var inertiaStatus = this.inertiaStatus,
                options = this.target.options[this.prepared.name].inertia,
                lambda = options.resistance,
                t = new Date().getTime() / 1000 - inertiaStatus.t0;

            if (t < inertiaStatus.te) {

                var progress =  1 - (Math.exp(-lambda * t) - inertiaStatus.lambda_v0) / inertiaStatus.one_ve_v0;

                if (inertiaStatus.modifiedXe === inertiaStatus.xe && inertiaStatus.modifiedYe === inertiaStatus.ye) {
                    inertiaStatus.sx = inertiaStatus.xe * progress;
                    inertiaStatus.sy = inertiaStatus.ye * progress;
                }
                else {
                    var quadPoint = getQuadraticCurvePoint(
                            0, 0,
                            inertiaStatus.xe, inertiaStatus.ye,
                            inertiaStatus.modifiedXe, inertiaStatus.modifiedYe,
                            progress);

                    inertiaStatus.sx = quadPoint.x;
                    inertiaStatus.sy = quadPoint.y;
                }

                this.pointerMove(inertiaStatus.startEvent, inertiaStatus.startEvent);

                inertiaStatus.i = reqFrame(this.boundInertiaFrame);
            }
            else {
                inertiaStatus.ending = true;

                inertiaStatus.sx = inertiaStatus.modifiedXe;
                inertiaStatus.sy = inertiaStatus.modifiedYe;

                this.pointerMove(inertiaStatus.startEvent, inertiaStatus.startEvent);
                this.pointerEnd(inertiaStatus.startEvent, inertiaStatus.startEvent);

                inertiaStatus.active = inertiaStatus.ending = false;
            }
        },

        smoothEndFrame: function () {
            var inertiaStatus = this.inertiaStatus,
                t = new Date().getTime() - inertiaStatus.t0,
                duration = this.target.options[this.prepared.name].inertia.smoothEndDuration;

            if (t < duration) {
                inertiaStatus.sx = easeOutQuad(t, 0, inertiaStatus.xe, duration);
                inertiaStatus.sy = easeOutQuad(t, 0, inertiaStatus.ye, duration);

                this.pointerMove(inertiaStatus.startEvent, inertiaStatus.startEvent);

                inertiaStatus.i = reqFrame(this.boundSmoothEndFrame);
            }
            else {
                inertiaStatus.ending = true;

                inertiaStatus.sx = inertiaStatus.xe;
                inertiaStatus.sy = inertiaStatus.ye;

                this.pointerMove(inertiaStatus.startEvent, inertiaStatus.startEvent);
                this.pointerEnd(inertiaStatus.startEvent, inertiaStatus.startEvent);

                inertiaStatus.smoothEnd =
                  inertiaStatus.active = inertiaStatus.ending = false;
            }
        },

        addPointer: function (pointer) {
            var id = getPointerId(pointer),
                index = this.mouse? 0 : indexOf(this.pointerIds, id);

            if (index === -1) {
                index = this.pointerIds.length;
            }

            this.pointerIds[index] = id;
            this.pointers[index] = pointer;

            return index;
        },

        removePointer: function (pointer) {
            var id = getPointerId(pointer),
                index = this.mouse? 0 : indexOf(this.pointerIds, id);

            if (index === -1) { return; }

            this.pointers   .splice(index, 1);
            this.pointerIds .splice(index, 1);
            this.downTargets.splice(index, 1);
            this.downTimes  .splice(index, 1);
            this.holdTimers .splice(index, 1);
        },

        recordPointer: function (pointer) {
            var index = this.mouse? 0: indexOf(this.pointerIds, getPointerId(pointer));

            if (index === -1) { return; }

            this.pointers[index] = pointer;
        },

        collectEventTargets: function (pointer, event, eventTarget, eventType) {
            var pointerIndex = this.mouse? 0 : indexOf(this.pointerIds, getPointerId(pointer));

            // do not fire a tap event if the pointer was moved before being lifted
            if (eventType === 'tap' && (this.pointerWasMoved
                // or if the pointerup target is different to the pointerdown target
                || !(this.downTargets[pointerIndex] && this.downTargets[pointerIndex] === eventTarget))) {
                return;
            }

            var targets = [],
                elements = [],
                element = eventTarget;

            function collectSelectors (interactable, selector, context) {
                var els = ie8MatchesSelector
                        ? context.querySelectorAll(selector)
                        : undefined;

                if (interactable._iEvents[eventType]
                    && isElement(element)
                    && inContext(interactable, element)
                    && !testIgnore(interactable, element, eventTarget)
                    && testAllow(interactable, element, eventTarget)
                    && matchesSelector(element, selector, els)) {

                    targets.push(interactable);
                    elements.push(element);
                }
            }

            while (element) {
                if (interact.isSet(element) && interact(element)._iEvents[eventType]) {
                    targets.push(interact(element));
                    elements.push(element);
                }

                interactables.forEachSelector(collectSelectors);

                element = parentElement(element);
            }

            // create the tap event even if there are no listeners so that
            // doubletap can still be created and fired
            if (targets.length || eventType === 'tap') {
                this.firePointers(pointer, event, eventTarget, targets, elements, eventType);
            }
        },

        firePointers: function (pointer, event, eventTarget, targets, elements, eventType) {
            var pointerIndex = this.mouse? 0 : indexOf(this.pointerIds, getPointerId(pointer)),
                pointerEvent = {},
                i,
                // for tap events
                interval, createNewDoubleTap;

            // if it's a doubletap then the event properties would have been
            // copied from the tap event and provided as the pointer argument
            if (eventType === 'doubletap') {
                pointerEvent = pointer;
            }
            else {
                pointerExtend(pointerEvent, event);
                if (event !== pointer) {
                    pointerExtend(pointerEvent, pointer);
                }

                pointerEvent.preventDefault           = preventOriginalDefault;
                pointerEvent.stopPropagation          = InteractEvent.prototype.stopPropagation;
                pointerEvent.stopImmediatePropagation = InteractEvent.prototype.stopImmediatePropagation;
                pointerEvent.interaction              = this;

                pointerEvent.timeStamp       = new Date().getTime();
                pointerEvent.originalEvent   = event;
                pointerEvent.originalPointer = pointer;
                pointerEvent.type            = eventType;
                pointerEvent.pointerId       = getPointerId(pointer);
                pointerEvent.pointerType     = this.mouse? 'mouse' : !supportsPointerEvent? 'touch'
                                                    : isString(pointer.pointerType)
                                                        ? pointer.pointerType
                                                        : [,,'touch', 'pen', 'mouse'][pointer.pointerType];
            }

            if (eventType === 'tap') {
                pointerEvent.dt = pointerEvent.timeStamp - this.downTimes[pointerIndex];

                interval = pointerEvent.timeStamp - this.tapTime;
                createNewDoubleTap = !!(this.prevTap && this.prevTap.type !== 'doubletap'
                       && this.prevTap.target === pointerEvent.target
                       && interval < 500);

                pointerEvent.double = createNewDoubleTap;

                this.tapTime = pointerEvent.timeStamp;
            }

            for (i = 0; i < targets.length; i++) {
                pointerEvent.currentTarget = elements[i];
                pointerEvent.interactable = targets[i];
                targets[i].fire(pointerEvent);

                if (pointerEvent.immediatePropagationStopped
                    ||(pointerEvent.propagationStopped && elements[i + 1] !== pointerEvent.currentTarget)) {
                    break;
                }
            }

            if (createNewDoubleTap) {
                var doubleTap = {};

                extend(doubleTap, pointerEvent);

                doubleTap.dt   = interval;
                doubleTap.type = 'doubletap';

                this.collectEventTargets(doubleTap, event, eventTarget, 'doubletap');

                this.prevTap = doubleTap;
            }
            else if (eventType === 'tap') {
                this.prevTap = pointerEvent;
            }
        },

        validateSelector: function (pointer, event, matches, matchElements) {
            for (var i = 0, len = matches.length; i < len; i++) {
                var match = matches[i],
                    matchElement = matchElements[i],
                    action = validateAction(match.getAction(pointer, event, this, matchElement), match);

                if (action && withinInteractionLimit(match, matchElement, action)) {
                    this.target = match;
                    this.element = matchElement;

                    return action;
                }
            }
        },

        setSnapping: function (pageCoords, status) {
            var snap = this.target.options[this.prepared.name].snap,
                targets = [],
                target,
                page,
                i;

            status = status || this.snapStatus;

            if (status.useStatusXY) {
                page = { x: status.x, y: status.y };
            }
            else {
                var origin = getOriginXY(this.target, this.element);

                page = extend({}, pageCoords);

                page.x -= origin.x;
                page.y -= origin.y;
            }

            status.realX = page.x;
            status.realY = page.y;

            page.x = page.x - this.inertiaStatus.resumeDx;
            page.y = page.y - this.inertiaStatus.resumeDy;

            var len = snap.targets? snap.targets.length : 0;

            for (var relIndex = 0; relIndex < this.snapOffsets.length; relIndex++) {
                var relative = {
                    x: page.x - this.snapOffsets[relIndex].x,
                    y: page.y - this.snapOffsets[relIndex].y
                };

                for (i = 0; i < len; i++) {
                    if (isFunction(snap.targets[i])) {
                        target = snap.targets[i](relative.x, relative.y, this);
                    }
                    else {
                        target = snap.targets[i];
                    }

                    if (!target) { continue; }

                    targets.push({
                        x: isNumber(target.x) ? (target.x + this.snapOffsets[relIndex].x) : relative.x,
                        y: isNumber(target.y) ? (target.y + this.snapOffsets[relIndex].y) : relative.y,

                        range: isNumber(target.range)? target.range: snap.range
                    });
                }
            }

            var closest = {
                    target: null,
                    inRange: false,
                    distance: 0,
                    range: 0,
                    dx: 0,
                    dy: 0
                };

            for (i = 0, len = targets.length; i < len; i++) {
                target = targets[i];

                var range = target.range,
                    dx = target.x - page.x,
                    dy = target.y - page.y,
                    distance = hypot(dx, dy),
                    inRange = distance <= range;

                // Infinite targets count as being out of range
                // compared to non infinite ones that are in range
                if (range === Infinity && closest.inRange && closest.range !== Infinity) {
                    inRange = false;
                }

                if (!closest.target || (inRange
                    // is the closest target in range?
                    ? (closest.inRange && range !== Infinity
                        // the pointer is relatively deeper in this target
                        ? distance / range < closest.distance / closest.range
                        // this target has Infinite range and the closest doesn't
                        : (range === Infinity && closest.range !== Infinity)
                            // OR this target is closer that the previous closest
                            || distance < closest.distance)
                    // The other is not in range and the pointer is closer to this target
                    : (!closest.inRange && distance < closest.distance))) {

                    if (range === Infinity) {
                        inRange = true;
                    }

                    closest.target = target;
                    closest.distance = distance;
                    closest.range = range;
                    closest.inRange = inRange;
                    closest.dx = dx;
                    closest.dy = dy;

                    status.range = range;
                }
            }

            var snapChanged;

            if (closest.target) {
                snapChanged = (status.snappedX !== closest.target.x || status.snappedY !== closest.target.y);

                status.snappedX = closest.target.x;
                status.snappedY = closest.target.y;
            }
            else {
                snapChanged = true;

                status.snappedX = NaN;
                status.snappedY = NaN;
            }

            status.dx = closest.dx;
            status.dy = closest.dy;

            status.changed = (snapChanged || (closest.inRange && !status.locked));
            status.locked = closest.inRange;

            return status;
        },

        setRestriction: function (pageCoords, status) {
            var target = this.target,
                restrict = target && target.options[this.prepared.name].restrict,
                restriction = restrict && restrict.restriction,
                page;

            if (!restriction) {
                return status;
            }

            status = status || this.restrictStatus;

            page = status.useStatusXY
                    ? page = { x: status.x, y: status.y }
                    : page = extend({}, pageCoords);

            if (status.snap && status.snap.locked) {
                page.x += status.snap.dx || 0;
                page.y += status.snap.dy || 0;
            }

            page.x -= this.inertiaStatus.resumeDx;
            page.y -= this.inertiaStatus.resumeDy;

            status.dx = 0;
            status.dy = 0;
            status.restricted = false;

            var rect, restrictedX, restrictedY;

            if (isString(restriction)) {
                if (restriction === 'parent') {
                    restriction = parentElement(this.element);
                }
                else if (restriction === 'self') {
                    restriction = target.getRect(this.element);
                }
                else {
                    restriction = closest(this.element, restriction);
                }

                if (!restriction) { return status; }
            }

            if (isFunction(restriction)) {
                restriction = restriction(page.x, page.y, this.element);
            }

            if (isElement(restriction)) {
                restriction = getElementRect(restriction);
            }

            rect = restriction;

            if (!restriction) {
                restrictedX = page.x;
                restrictedY = page.y;
            }
            // object is assumed to have
            // x, y, width, height or
            // left, top, right, bottom
            else if ('x' in restriction && 'y' in restriction) {
                restrictedX = Math.max(Math.min(rect.x + rect.width  - this.restrictOffset.right , page.x), rect.x + this.restrictOffset.left);
                restrictedY = Math.max(Math.min(rect.y + rect.height - this.restrictOffset.bottom, page.y), rect.y + this.restrictOffset.top );
            }
            else {
                restrictedX = Math.max(Math.min(rect.right  - this.restrictOffset.right , page.x), rect.left + this.restrictOffset.left);
                restrictedY = Math.max(Math.min(rect.bottom - this.restrictOffset.bottom, page.y), rect.top  + this.restrictOffset.top );
            }

            status.dx = restrictedX - page.x;
            status.dy = restrictedY - page.y;

            status.changed = status.restrictedX !== restrictedX || status.restrictedY !== restrictedY;
            status.restricted = !!(status.dx || status.dy);

            status.restrictedX = restrictedX;
            status.restrictedY = restrictedY;

            return status;
        },

        checkAndPreventDefault: function (event, interactable, element) {
            if (!(interactable = interactable || this.target)) { return; }

            var options = interactable.options,
                prevent = options.preventDefault;

            if (prevent === 'auto' && element && !/^(input|select|textarea)$/i.test(event.target.nodeName)) {
                // do not preventDefault on pointerdown if the prepared action is a drag
                // and dragging can only start from a certain direction - this allows
                // a touch to pan the viewport if a drag isn't in the right direction
                if (/down|start/i.test(event.type)
                    && this.prepared.name === 'drag' && options.drag.axis !== 'xy') {

                    return;
                }

                // with manualStart, only preventDefault while interacting
                if (options[this.prepared.name] && options[this.prepared.name].manualStart
                    && !this.interacting()) {
                    return;
                }

                event.preventDefault();
                return;
            }

            if (prevent === 'always') {
                event.preventDefault();
                return;
            }
        },

        calcInertia: function (status) {
            var inertiaOptions = this.target.options[this.prepared.name].inertia,
                lambda = inertiaOptions.resistance,
                inertiaDur = -Math.log(inertiaOptions.endSpeed / status.v0) / lambda;

            status.x0 = this.prevEvent.pageX;
            status.y0 = this.prevEvent.pageY;
            status.t0 = status.startEvent.timeStamp / 1000;
            status.sx = status.sy = 0;

            status.modifiedXe = status.xe = (status.vx0 - inertiaDur) / lambda;
            status.modifiedYe = status.ye = (status.vy0 - inertiaDur) / lambda;
            status.te = inertiaDur;

            status.lambda_v0 = lambda / status.v0;
            status.one_ve_v0 = 1 - inertiaOptions.endSpeed / status.v0;
        },

        autoScrollMove: function (pointer) {
            if (!(this.interacting()
                && checkAutoScroll(this.target, this.prepared.name))) {
                return;
            }

            if (this.inertiaStatus.active) {
                autoScroll.x = autoScroll.y = 0;
                return;
            }

            var top,
                right,
                bottom,
                left,
                options = this.target.options[this.prepared.name].autoScroll,
                container = options.container || getWindow(this.element);

            if (isWindow(container)) {
                left   = pointer.clientX < autoScroll.margin;
                top    = pointer.clientY < autoScroll.margin;
                right  = pointer.clientX > container.innerWidth  - autoScroll.margin;
                bottom = pointer.clientY > container.innerHeight - autoScroll.margin;
            }
            else {
                var rect = getElementClientRect(container);

                left   = pointer.clientX < rect.left   + autoScroll.margin;
                top    = pointer.clientY < rect.top    + autoScroll.margin;
                right  = pointer.clientX > rect.right  - autoScroll.margin;
                bottom = pointer.clientY > rect.bottom - autoScroll.margin;
            }

            autoScroll.x = (right ? 1: left? -1: 0);
            autoScroll.y = (bottom? 1:  top? -1: 0);

            if (!autoScroll.isScrolling) {
                // set the autoScroll properties to those of the target
                autoScroll.margin = options.margin;
                autoScroll.speed  = options.speed;

                autoScroll.start(this);
            }
        },

        _updateEventTargets: function (target, currentTarget) {
            this._eventTarget    = target;
            this._curEventTarget = currentTarget;
        }

    };

    function getInteractionFromPointer (pointer, eventType, eventTarget) {
        var i = 0, len = interactions.length,
            mouseEvent = (/mouse/i.test(pointer.pointerType || eventType)
                          // MSPointerEvent.MSPOINTER_TYPE_MOUSE
                          || pointer.pointerType === 4),
            interaction;

        var id = getPointerId(pointer);

        // try to resume inertia with a new pointer
        if (/down|start/i.test(eventType)) {
            for (i = 0; i < len; i++) {
                interaction = interactions[i];

                var element = eventTarget;

                if (interaction.inertiaStatus.active && interaction.target.options[interaction.prepared.name].inertia.allowResume
                    && (interaction.mouse === mouseEvent)) {
                    while (element) {
                        // if the element is the interaction element
                        if (element === interaction.element) {
                            return interaction;
                        }
                        element = parentElement(element);
                    }
                }
            }
        }

        // if it's a mouse interaction
        if (mouseEvent || !(supportsTouch || supportsPointerEvent)) {

            // find a mouse interaction that's not in inertia phase
            for (i = 0; i < len; i++) {
                if (interactions[i].mouse && !interactions[i].inertiaStatus.active) {
                    return interactions[i];
                }
            }

            // find any interaction specifically for mouse.
            // if the eventType is a mousedown, and inertia is active
            // ignore the interaction
            for (i = 0; i < len; i++) {
                if (interactions[i].mouse && !(/down/.test(eventType) && interactions[i].inertiaStatus.active)) {
                    return interaction;
                }
            }

            // create a new interaction for mouse
            interaction = new Interaction();
            interaction.mouse = true;

            return interaction;
        }

        // get interaction that has this pointer
        for (i = 0; i < len; i++) {
            if (contains(interactions[i].pointerIds, id)) {
                return interactions[i];
            }
        }

        // at this stage, a pointerUp should not return an interaction
        if (/up|end|out/i.test(eventType)) {
            return null;
        }

        // get first idle interaction
        for (i = 0; i < len; i++) {
            interaction = interactions[i];

            if ((!interaction.prepared.name || (interaction.target.options.gesture.enabled))
                && !interaction.interacting()
                && !(!mouseEvent && interaction.mouse)) {

                return interaction;
            }
        }

        return new Interaction();
    }

    function doOnInteractions (method) {
        return (function (event) {
            var interaction,
                eventTarget = getActualElement(event.path
                                               ? event.path[0]
                                               : event.target),
                curEventTarget = getActualElement(event.currentTarget),
                i;

            if (supportsTouch && /touch/.test(event.type)) {
                prevTouchTime = new Date().getTime();

                for (i = 0; i < event.changedTouches.length; i++) {
                    var pointer = event.changedTouches[i];

                    interaction = getInteractionFromPointer(pointer, event.type, eventTarget);

                    if (!interaction) { continue; }

                    interaction._updateEventTargets(eventTarget, curEventTarget);

                    interaction[method](pointer, event, eventTarget, curEventTarget);
                }
            }
            else {
                if (!supportsPointerEvent && /mouse/.test(event.type)) {
                    // ignore mouse events while touch interactions are active
                    for (i = 0; i < interactions.length; i++) {
                        if (!interactions[i].mouse && interactions[i].pointerIsDown) {
                            return;
                        }
                    }

                    // try to ignore mouse events that are simulated by the browser
                    // after a touch event
                    if (new Date().getTime() - prevTouchTime < 500) {
                        return;
                    }
                }

                interaction = getInteractionFromPointer(event, event.type, eventTarget);

                if (!interaction) { return; }

                interaction._updateEventTargets(eventTarget, curEventTarget);

                interaction[method](event, event, eventTarget, curEventTarget);
            }
        });
    }

    function InteractEvent (interaction, event, action, phase, element, related) {
        var client,
            page,
            target      = interaction.target,
            snapStatus  = interaction.snapStatus,
            restrictStatus  = interaction.restrictStatus,
            pointers    = interaction.pointers,
            deltaSource = (target && target.options || defaultOptions).deltaSource,
            sourceX     = deltaSource + 'X',
            sourceY     = deltaSource + 'Y',
            options     = target? target.options: defaultOptions,
            origin      = getOriginXY(target, element),
            starting    = phase === 'start',
            ending      = phase === 'end',
            coords      = starting? interaction.startCoords : interaction.curCoords;

        element = element || interaction.element;

        page   = extend({}, coords.page);
        client = extend({}, coords.client);

        page.x -= origin.x;
        page.y -= origin.y;

        client.x -= origin.x;
        client.y -= origin.y;

        var relativePoints = options[action].snap && options[action].snap.relativePoints ;

        if (checkSnap(target, action) && !(starting && relativePoints && relativePoints.length)) {
            this.snap = {
                range  : snapStatus.range,
                locked : snapStatus.locked,
                x      : snapStatus.snappedX,
                y      : snapStatus.snappedY,
                realX  : snapStatus.realX,
                realY  : snapStatus.realY,
                dx     : snapStatus.dx,
                dy     : snapStatus.dy
            };

            if (snapStatus.locked) {
                page.x += snapStatus.dx;
                page.y += snapStatus.dy;
                client.x += snapStatus.dx;
                client.y += snapStatus.dy;
            }
        }

        if (checkRestrict(target, action) && !(starting && options[action].restrict.elementRect) && restrictStatus.restricted) {
            page.x += restrictStatus.dx;
            page.y += restrictStatus.dy;
            client.x += restrictStatus.dx;
            client.y += restrictStatus.dy;

            this.restrict = {
                dx: restrictStatus.dx,
                dy: restrictStatus.dy
            };
        }

        this.pageX     = page.x;
        this.pageY     = page.y;
        this.clientX   = client.x;
        this.clientY   = client.y;

        this.x0        = interaction.startCoords.page.x - origin.x;
        this.y0        = interaction.startCoords.page.y - origin.y;
        this.clientX0  = interaction.startCoords.client.x - origin.x;
        this.clientY0  = interaction.startCoords.client.y - origin.y;
        this.ctrlKey   = event.ctrlKey;
        this.altKey    = event.altKey;
        this.shiftKey  = event.shiftKey;
        this.metaKey   = event.metaKey;
        this.button    = event.button;
        this.buttons   = event.buttons;
        this.target    = element;
        this.t0        = interaction.downTimes[0];
        this.type      = action + (phase || '');

        this.interaction = interaction;
        this.interactable = target;

        var inertiaStatus = interaction.inertiaStatus;

        if (inertiaStatus.active) {
            this.detail = 'inertia';
        }

        if (related) {
            this.relatedTarget = related;
        }

        // end event dx, dy is difference between start and end points
        if (ending) {
            if (deltaSource === 'client') {
                this.dx = client.x - interaction.startCoords.client.x;
                this.dy = client.y - interaction.startCoords.client.y;
            }
            else {
                this.dx = page.x - interaction.startCoords.page.x;
                this.dy = page.y - interaction.startCoords.page.y;
            }
        }
        else if (starting) {
            this.dx = 0;
            this.dy = 0;
        }
        // copy properties from previousmove if starting inertia
        else if (phase === 'inertiastart') {
            this.dx = interaction.prevEvent.dx;
            this.dy = interaction.prevEvent.dy;
        }
        else {
            if (deltaSource === 'client') {
                this.dx = client.x - interaction.prevEvent.clientX;
                this.dy = client.y - interaction.prevEvent.clientY;
            }
            else {
                this.dx = page.x - interaction.prevEvent.pageX;
                this.dy = page.y - interaction.prevEvent.pageY;
            }
        }
        if (interaction.prevEvent && interaction.prevEvent.detail === 'inertia'
            && !inertiaStatus.active
            && options[action].inertia && options[action].inertia.zeroResumeDelta) {

            inertiaStatus.resumeDx += this.dx;
            inertiaStatus.resumeDy += this.dy;

            this.dx = this.dy = 0;
        }

        if (action === 'resize' && interaction.resizeAxes) {
            if (options.resize.square) {
                if (interaction.resizeAxes === 'y') {
                    this.dx = this.dy;
                }
                else {
                    this.dy = this.dx;
                }
                this.axes = 'xy';
            }
            else {
                this.axes = interaction.resizeAxes;

                if (interaction.resizeAxes === 'x') {
                    this.dy = 0;
                }
                else if (interaction.resizeAxes === 'y') {
                    this.dx = 0;
                }
            }
        }
        else if (action === 'gesture') {
            this.touches = [pointers[0], pointers[1]];

            if (starting) {
                this.distance = touchDistance(pointers, deltaSource);
                this.box      = touchBBox(pointers);
                this.scale    = 1;
                this.ds       = 0;
                this.angle    = touchAngle(pointers, undefined, deltaSource);
                this.da       = 0;
            }
            else if (ending || event instanceof InteractEvent) {
                this.distance = interaction.prevEvent.distance;
                this.box      = interaction.prevEvent.box;
                this.scale    = interaction.prevEvent.scale;
                this.ds       = this.scale - 1;
                this.angle    = interaction.prevEvent.angle;
                this.da       = this.angle - interaction.gesture.startAngle;
            }
            else {
                this.distance = touchDistance(pointers, deltaSource);
                this.box      = touchBBox(pointers);
                this.scale    = this.distance / interaction.gesture.startDistance;
                this.angle    = touchAngle(pointers, interaction.gesture.prevAngle, deltaSource);

                this.ds = this.scale - interaction.gesture.prevScale;
                this.da = this.angle - interaction.gesture.prevAngle;
            }
        }

        if (starting) {
            this.timeStamp = interaction.downTimes[0];
            this.dt        = 0;
            this.duration  = 0;
            this.speed     = 0;
            this.velocityX = 0;
            this.velocityY = 0;
        }
        else if (phase === 'inertiastart') {
            this.timeStamp = interaction.prevEvent.timeStamp;
            this.dt        = interaction.prevEvent.dt;
            this.duration  = interaction.prevEvent.duration;
            this.speed     = interaction.prevEvent.speed;
            this.velocityX = interaction.prevEvent.velocityX;
            this.velocityY = interaction.prevEvent.velocityY;
        }
        else {
            this.timeStamp = new Date().getTime();
            this.dt        = this.timeStamp - interaction.prevEvent.timeStamp;
            this.duration  = this.timeStamp - interaction.downTimes[0];

            if (event instanceof InteractEvent) {
                var dx = this[sourceX] - interaction.prevEvent[sourceX],
                    dy = this[sourceY] - interaction.prevEvent[sourceY],
                    dt = this.dt / 1000;

                this.speed = hypot(dx, dy) / dt;
                this.velocityX = dx / dt;
                this.velocityY = dy / dt;
            }
            // if normal move or end event, use previous user event coords
            else {
                // speed and velocity in pixels per second
                this.speed = interaction.pointerDelta[deltaSource].speed;
                this.velocityX = interaction.pointerDelta[deltaSource].vx;
                this.velocityY = interaction.pointerDelta[deltaSource].vy;
            }
        }

        if ((ending || phase === 'inertiastart')
            && interaction.prevEvent.speed > 600 && this.timeStamp - interaction.prevEvent.timeStamp < 150) {

            var angle = 180 * Math.atan2(interaction.prevEvent.velocityY, interaction.prevEvent.velocityX) / Math.PI,
                overlap = 22.5;

            if (angle < 0) {
                angle += 360;
            }

            var left = 135 - overlap <= angle && angle < 225 + overlap,
                up   = 225 - overlap <= angle && angle < 315 + overlap,

                right = !left && (315 - overlap <= angle || angle <  45 + overlap),
                down  = !up   &&   45 - overlap <= angle && angle < 135 + overlap;

            this.swipe = {
                up   : up,
                down : down,
                left : left,
                right: right,
                angle: angle,
                speed: interaction.prevEvent.speed,
                velocity: {
                    x: interaction.prevEvent.velocityX,
                    y: interaction.prevEvent.velocityY
                }
            };
        }
    }

    InteractEvent.prototype = {
        preventDefault: blank,
        stopImmediatePropagation: function () {
            this.immediatePropagationStopped = this.propagationStopped = true;
        },
        stopPropagation: function () {
            this.propagationStopped = true;
        }
    };

    function preventOriginalDefault () {
        this.originalEvent.preventDefault();
    }

    function getActionCursor (action) {
        var cursor = '';

        if (action.name === 'drag') {
            cursor =  actionCursors.drag;
        }
        if (action.name === 'resize') {
            if (action.axis) {
                cursor =  actionCursors[action.name + action.axis];
            }
            else if (action.edges) {
                var cursorKey = 'resize',
                    edgeNames = ['top', 'bottom', 'left', 'right'];

                for (var i = 0; i < 4; i++) {
                    if (action.edges[edgeNames[i]]) {
                        cursorKey += edgeNames[i];
                    }
                }

                cursor = actionCursors[cursorKey];
            }
        }

        return cursor;
    }

    function checkResizeEdge (name, value, page, element, interactableElement, rect, margin) {
        // false, '', undefined, null
        if (!value) { return false; }

        // true value, use pointer coords and element rect
        if (value === true) {
            // if dimensions are negative, "switch" edges
            var width = isNumber(rect.width)? rect.width : rect.right - rect.left,
                height = isNumber(rect.height)? rect.height : rect.bottom - rect.top;

            if (width < 0) {
                if      (name === 'left' ) { name = 'right'; }
                else if (name === 'right') { name = 'left' ; }
            }
            if (height < 0) {
                if      (name === 'top'   ) { name = 'bottom'; }
                else if (name === 'bottom') { name = 'top'   ; }
            }

            if (name === 'left'  ) { return page.x < ((width  >= 0? rect.left: rect.right ) + margin); }
            if (name === 'top'   ) { return page.y < ((height >= 0? rect.top : rect.bottom) + margin); }

            if (name === 'right' ) { return page.x > ((width  >= 0? rect.right : rect.left) - margin); }
            if (name === 'bottom') { return page.y > ((height >= 0? rect.bottom: rect.top ) - margin); }
        }

        // the remaining checks require an element
        if (!isElement(element)) { return false; }

        return isElement(value)
                    // the value is an element to use as a resize handle
                    ? value === element
                    // otherwise check if element matches value as selector
                    : matchesUpTo(element, value, interactableElement);
    }

    function defaultActionChecker (pointer, interaction, element) {
        var rect = this.getRect(element),
            shouldResize = false,
            action = null,
            resizeAxes = null,
            resizeEdges,
            page = extend({}, interaction.curCoords.page),
            options = this.options;

        if (!rect) { return null; }

        if (actionIsEnabled.resize && options.resize.enabled) {
            var resizeOptions = options.resize;

            resizeEdges = {
                left: false, right: false, top: false, bottom: false
            };

            // if using resize.edges
            if (isObject(resizeOptions.edges)) {
                for (var edge in resizeEdges) {
                    resizeEdges[edge] = checkResizeEdge(edge,
                                                        resizeOptions.edges[edge],
                                                        page,
                                                        interaction._eventTarget,
                                                        element,
                                                        rect,
                                                        resizeOptions.margin || margin);
                }

                resizeEdges.left = resizeEdges.left && !resizeEdges.right;
                resizeEdges.top  = resizeEdges.top  && !resizeEdges.bottom;

                shouldResize = resizeEdges.left || resizeEdges.right || resizeEdges.top || resizeEdges.bottom;
            }
            else {
                var right  = options.resize.axis !== 'y' && page.x > (rect.right  - margin),
                    bottom = options.resize.axis !== 'x' && page.y > (rect.bottom - margin);

                shouldResize = right || bottom;
                resizeAxes = (right? 'x' : '') + (bottom? 'y' : '');
            }
        }

        action = shouldResize
            ? 'resize'
            : actionIsEnabled.drag && options.drag.enabled
                ? 'drag'
                : null;

        if (actionIsEnabled.gesture
            && interaction.pointerIds.length >=2
            && !(interaction.dragging || interaction.resizing)) {
            action = 'gesture';
        }

        if (action) {
            return {
                name: action,
                axis: resizeAxes,
                edges: resizeEdges
            };
        }

        return null;
    }

    // Check if action is enabled globally and the current target supports it
    // If so, return the validated action. Otherwise, return null
    function validateAction (action, interactable) {
        if (!isObject(action)) { return null; }

        var actionName = action.name,
            options = interactable.options;

        if ((  (actionName  === 'resize'   && options.resize.enabled )
            || (actionName      === 'drag'     && options.drag.enabled  )
            || (actionName      === 'gesture'  && options.gesture.enabled))
            && actionIsEnabled[actionName]) {

            if (actionName === 'resize' || actionName === 'resizeyx') {
                actionName = 'resizexy';
            }

            return action;
        }
        return null;
    }

    var listeners = {},
        interactionListeners = [
            'dragStart', 'dragMove', 'resizeStart', 'resizeMove', 'gestureStart', 'gestureMove',
            'pointerOver', 'pointerOut', 'pointerHover', 'selectorDown',
            'pointerDown', 'pointerMove', 'pointerUp', 'pointerCancel', 'pointerEnd',
            'addPointer', 'removePointer', 'recordPointer', 'autoScrollMove'
        ];

    for (var i = 0, len = interactionListeners.length; i < len; i++) {
        var name = interactionListeners[i];

        listeners[name] = doOnInteractions(name);
    }

    // bound to the interactable context when a DOM event
    // listener is added to a selector interactable
    function delegateListener (event, useCapture) {
        var fakeEvent = {},
            delegated = delegatedEvents[event.type],
            eventTarget = getActualElement(event.path
                                           ? event.path[0]
                                           : event.target),
            element = eventTarget;

        useCapture = useCapture? true: false;

        // duplicate the event so that currentTarget can be changed
        for (var prop in event) {
            fakeEvent[prop] = event[prop];
        }

        fakeEvent.originalEvent = event;
        fakeEvent.preventDefault = preventOriginalDefault;

        // climb up document tree looking for selector matches
        while (isElement(element)) {
            for (var i = 0; i < delegated.selectors.length; i++) {
                var selector = delegated.selectors[i],
                    context = delegated.contexts[i];

                if (matchesSelector(element, selector)
                    && nodeContains(context, eventTarget)
                    && nodeContains(context, element)) {

                    var listeners = delegated.listeners[i];

                    fakeEvent.currentTarget = element;

                    for (var j = 0; j < listeners.length; j++) {
                        if (listeners[j][1] === useCapture) {
                            listeners[j][0](fakeEvent);
                        }
                    }
                }
            }

            element = parentElement(element);
        }
    }

    function delegateUseCapture (event) {
        return delegateListener.call(this, event, true);
    }

    interactables.indexOfElement = function indexOfElement (element, context) {
        context = context || document;

        for (var i = 0; i < this.length; i++) {
            var interactable = this[i];

            if ((interactable.selector === element
                && (interactable._context === context))
                || (!interactable.selector && interactable._element === element)) {

                return i;
            }
        }
        return -1;
    };

    interactables.get = function interactableGet (element, options) {
        return this[this.indexOfElement(element, options && options.context)];
    };

    interactables.forEachSelector = function (callback) {
        for (var i = 0; i < this.length; i++) {
            var interactable = this[i];

            if (!interactable.selector) {
                continue;
            }

            var ret = callback(interactable, interactable.selector, interactable._context, i, this);

            if (ret !== undefined) {
                return ret;
            }
        }
    };

    /*\
     * interact
     [ method ]
     *
     * The methods of this variable can be used to set elements as
     * interactables and also to change various default settings.
     *
     * Calling it as a function and passing an element or a valid CSS selector
     * string returns an Interactable object which has various methods to
     * configure it.
     *
     - element (Element | string) The HTML or SVG Element to interact with or CSS selector
     = (object) An @Interactable
     *
     > Usage
     | interact(document.getElementById('draggable')).draggable(true);
     |
     | var rectables = interact('rect');
     | rectables
     |     .gesturable(true)
     |     .on('gesturemove', function (event) {
     |         // something cool...
     |     })
     |     .autoScroll(true);
    \*/
    function interact (element, options) {
        return interactables.get(element, options) || new Interactable(element, options);
    }

    /*\
     * Interactable
     [ property ]
     **
     * Object type returned by @interact
    \*/
    function Interactable (element, options) {
        this._element = element;
        this._iEvents = this._iEvents || {};

        var _window;

        if (trySelector(element)) {
            this.selector = element;

            var context = options && options.context;

            _window = context? getWindow(context) : window;

            if (context && (_window.Node
                    ? context instanceof _window.Node
                    : (isElement(context) || context === _window.document))) {

                this._context = context;
            }
        }
        else {
            _window = getWindow(element);

            if (isElement(element, _window)) {

                if (PointerEvent) {
                    events.add(this._element, pEventTypes.down, listeners.pointerDown );
                    events.add(this._element, pEventTypes.move, listeners.pointerHover);
                }
                else {
                    events.add(this._element, 'mousedown' , listeners.pointerDown );
                    events.add(this._element, 'mousemove' , listeners.pointerHover);
                    events.add(this._element, 'touchstart', listeners.pointerDown );
                    events.add(this._element, 'touchmove' , listeners.pointerHover);
                }
            }
        }

        this._doc = _window.document;

        if (!contains(documents, this._doc)) {
            listenToDocument(this._doc);
        }

        interactables.push(this);

        this.set(options);
    }

    Interactable.prototype = {
        setOnEvents: function (action, phases) {
            if (action === 'drop') {
                if (isFunction(phases.ondrop)          ) { this.ondrop           = phases.ondrop          ; }
                if (isFunction(phases.ondropactivate)  ) { this.ondropactivate   = phases.ondropactivate  ; }
                if (isFunction(phases.ondropdeactivate)) { this.ondropdeactivate = phases.ondropdeactivate; }
                if (isFunction(phases.ondragenter)     ) { this.ondragenter      = phases.ondragenter     ; }
                if (isFunction(phases.ondragleave)     ) { this.ondragleave      = phases.ondragleave     ; }
                if (isFunction(phases.ondropmove)      ) { this.ondropmove       = phases.ondropmove      ; }
            }
            else {
                action = 'on' + action;

                if (isFunction(phases.onstart)       ) { this[action + 'start'         ] = phases.onstart         ; }
                if (isFunction(phases.onmove)        ) { this[action + 'move'          ] = phases.onmove          ; }
                if (isFunction(phases.onend)         ) { this[action + 'end'           ] = phases.onend           ; }
                if (isFunction(phases.oninertiastart)) { this[action + 'inertiastart'  ] = phases.oninertiastart  ; }
            }

            return this;
        },

        /*\
         * Interactable.draggable
         [ method ]
         *
         * Gets or sets whether drag actions can be performed on the
         * Interactable
         *
         = (boolean) Indicates if this can be the target of drag events
         | var isDraggable = interact('ul li').draggable();
         * or
         - options (boolean | object) #optional true/false or An object with event listeners to be fired on drag events (object makes the Interactable draggable)
         = (object) This Interactable
         | interact(element).draggable({
         |     onstart: function (event) {},
         |     onmove : function (event) {},
         |     onend  : function (event) {},
         |
         |     // the axis in which the first movement must be
         |     // for the drag sequence to start
         |     // 'xy' by default - any direction
         |     axis: 'x' || 'y' || 'xy',
         |
         |     // max number of drags that can happen concurrently
         |     // with elements of this Interactable. Infinity by default
         |     max: Infinity,
         |
         |     // max number of drags that can target the same element+Interactable
         |     // 1 by default
         |     maxPerElement: 2
         | });
        \*/
        draggable: function (options) {
            if (isObject(options)) {
                this.options.drag.enabled = options.enabled === false? false: true;
                this.setPerAction('drag', options);
                this.setOnEvents('drag', options);

                if (/^x$|^y$|^xy$/.test(options.axis)) {
                    this.options.drag.axis = options.axis;
                }
                else if (options.axis === null) {
                    delete this.options.drag.axis;
                }

                return this;
            }

            if (isBool(options)) {
                this.options.drag.enabled = options;

                return this;
            }

            return this.options.drag;
        },

        setPerAction: function (action, options) {
            // for all the default per-action options
            for (var option in options) {
                // if this option exists for this action
                if (option in defaultOptions[action]) {
                    // if the option in the options arg is an object value
                    if (isObject(options[option])) {
                        // duplicate the object
                        this.options[action][option] = extend(this.options[action][option] || {}, options[option]);

                        if (isObject(defaultOptions.perAction[option]) && 'enabled' in defaultOptions.perAction[option]) {
                            this.options[action][option].enabled = options[option].enabled === false? false : true;
                        }
                    }
                    else if (isBool(options[option]) && isObject(defaultOptions.perAction[option])) {
                        this.options[action][option].enabled = options[option];
                    }
                    else if (options[option] !== undefined) {
                        // or if it's not undefined, do a plain assignment
                        this.options[action][option] = options[option];
                    }
                }
            }
        },

        /*\
         * Interactable.dropzone
         [ method ]
         *
         * Returns or sets whether elements can be dropped onto this
         * Interactable to trigger drop events
         *
         * Dropzones can receive the following events:
         *  - `dropactivate` and `dropdeactivate` when an acceptable drag starts and ends
         *  - `dragenter` and `dragleave` when a draggable enters and leaves the dropzone
         *  - `dragmove` when a draggable that has entered the dropzone is moved
         *  - `drop` when a draggable is dropped into this dropzone
         *
         *  Use the `accept` option to allow only elements that match the given CSS selector or element.
         *
         *  Use the `overlap` option to set how drops are checked for. The allowed values are:
         *   - `'pointer'`, the pointer must be over the dropzone (default)
         *   - `'center'`, the draggable element's center must be over the dropzone
         *   - a number from 0-1 which is the `(intersection area) / (draggable area)`.
         *       e.g. `0.5` for drop to happen when half of the area of the
         *       draggable is over the dropzone
         *
         - options (boolean | object | null) #optional The new value to be set.
         | interact('.drop').dropzone({
         |   accept: '.can-drop' || document.getElementById('single-drop'),
         |   overlap: 'pointer' || 'center' || zeroToOne
         | }
         = (boolean | object) The current setting or this Interactable
        \*/
        dropzone: function (options) {
            if (isObject(options)) {
                this.options.drop.enabled = options.enabled === false? false: true;
                this.setOnEvents('drop', options);

                if (/^(pointer|center)$/.test(options.overlap)) {
                    this.options.drop.overlap = options.overlap;
                }
                else if (isNumber(options.overlap)) {
                    this.options.drop.overlap = Math.max(Math.min(1, options.overlap), 0);
                }
                if ('accept' in options) {
                  this.options.drop.accept = options.accept;
                }
                if ('checker' in options) {
                  this.options.drop.checker = options.checker;
                }

                return this;
            }

            if (isBool(options)) {
                this.options.drop.enabled = options;

                return this;
            }

            return this.options.drop;
        },

        dropCheck: function (dragEvent, event, draggable, draggableElement, dropElement, rect) {
            var dropped = false;

            // if the dropzone has no rect (eg. display: none)
            // call the custom dropChecker or just return false
            if (!(rect = rect || this.getRect(dropElement))) {
                return (this.options.drop.checker
                    ? this.options.drop.checker(dragEvent, event, dropped, this, dropElement, draggable, draggableElement)
                    : false);
            }

            var dropOverlap = this.options.drop.overlap;

            if (dropOverlap === 'pointer') {
                var page = getPageXY(dragEvent),
                    origin = getOriginXY(draggable, draggableElement),
                    horizontal,
                    vertical;

                page.x += origin.x;
                page.y += origin.y;

                horizontal = (page.x > rect.left) && (page.x < rect.right);
                vertical   = (page.y > rect.top ) && (page.y < rect.bottom);

                dropped = horizontal && vertical;
            }

            var dragRect = draggable.getRect(draggableElement);

            if (dropOverlap === 'center') {
                var cx = dragRect.left + dragRect.width  / 2,
                    cy = dragRect.top  + dragRect.height / 2;

                dropped = cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom;
            }

            if (isNumber(dropOverlap)) {
                var overlapArea  = (Math.max(0, Math.min(rect.right , dragRect.right ) - Math.max(rect.left, dragRect.left))
                                  * Math.max(0, Math.min(rect.bottom, dragRect.bottom) - Math.max(rect.top , dragRect.top ))),
                    overlapRatio = overlapArea / (dragRect.width * dragRect.height);

                dropped = overlapRatio >= dropOverlap;
            }

            if (this.options.drop.checker) {
                dropped = this.options.drop.checker(dragEvent, event, dropped, this, dropElement, draggable, draggableElement);
            }

            return dropped;
        },

        /*\
         * Interactable.dropChecker
         [ method ]
         *
         * DEPRECATED. Use interactable.dropzone({ checker: function... }) instead.
         *
         * Gets or sets the function used to check if a dragged element is
         * over this Interactable.
         *
         - checker (function) #optional The function that will be called when checking for a drop
         = (Function | Interactable) The checker function or this Interactable
         *
         * The checker function takes the following arguments:
         *
         - dragEvent (InteractEvent) The related dragmove or dragend event
         - event (TouchEvent | PointerEvent | MouseEvent) The user move/up/end Event related to the dragEvent
         - dropped (boolean) The value from the default drop checker
         - dropzone (Interactable) The dropzone interactable
         - dropElement (Element) The dropzone element
         - draggable (Interactable) The Interactable being dragged
         - draggableElement (Element) The actual element that's being dragged
         *
         > Usage:
         | interact(target)
         | .dropChecker(function(dragEvent,         // related dragmove or dragend event
         |                       event,             // TouchEvent/PointerEvent/MouseEvent
         |                       dropped,           // bool result of the default checker
         |                       dropzone,          // dropzone Interactable
         |                       dropElement,       // dropzone elemnt
         |                       draggable,         // draggable Interactable
         |                       draggableElement) {// draggable element
         |
         |   return dropped && event.target.hasAttribute('allow-drop');
         | }
        \*/
        dropChecker: function (checker) {
            if (isFunction(checker)) {
                this.options.drop.checker = checker;

                return this;
            }
            if (checker === null) {
                delete this.options.getRect;

                return this;
            }

            return this.options.drop.checker;
        },

        /*\
         * Interactable.accept
         [ method ]
         *
         * Deprecated. add an `accept` property to the options object passed to
         * @Interactable.dropzone instead.
         *
         * Gets or sets the Element or CSS selector match that this
         * Interactable accepts if it is a dropzone.
         *
         - newValue (Element | string | null) #optional
         * If it is an Element, then only that element can be dropped into this dropzone.
         * If it is a string, the element being dragged must match it as a selector.
         * If it is null, the accept options is cleared - it accepts any element.
         *
         = (string | Element | null | Interactable) The current accept option if given `undefined` or this Interactable
        \*/
        accept: function (newValue) {
            if (isElement(newValue)) {
                this.options.drop.accept = newValue;

                return this;
            }

            // test if it is a valid CSS selector
            if (trySelector(newValue)) {
                this.options.drop.accept = newValue;

                return this;
            }

            if (newValue === null) {
                delete this.options.drop.accept;

                return this;
            }

            return this.options.drop.accept;
        },

        /*\
         * Interactable.resizable
         [ method ]
         *
         * Gets or sets whether resize actions can be performed on the
         * Interactable
         *
         = (boolean) Indicates if this can be the target of resize elements
         | var isResizeable = interact('input[type=text]').resizable();
         * or
         - options (boolean | object) #optional true/false or An object with event listeners to be fired on resize events (object makes the Interactable resizable)
         = (object) This Interactable
         | interact(element).resizable({
         |     onstart: function (event) {},
         |     onmove : function (event) {},
         |     onend  : function (event) {},
         |
         |     edges: {
         |       top   : true,       // Use pointer coords to check for resize.
         |       left  : false,      // Disable resizing from left edge.
         |       bottom: '.resize-s',// Resize if pointer target matches selector
         |       right : handleEl    // Resize if pointer target is the given Element
         |     },
         |
         |     // Width and height can be adjusted independently. When `true`, width and
         |     // height are adjusted at a 1:1 ratio.
         |     square: false,
         |
         |     // Width and height can be adjusted independently. When `true`, width and
         |     // height maintain the aspect ratio they had when resizing started.
         |     preserveAspectRatio: false,
         |
         |     // a value of 'none' will limit the resize rect to a minimum of 0x0
         |     // 'negate' will allow the rect to have negative width/height
         |     // 'reposition' will keep the width/height positive by swapping
         |     // the top and bottom edges and/or swapping the left and right edges
         |     invert: 'none' || 'negate' || 'reposition'
         |
         |     // limit multiple resizes.
         |     // See the explanation in the @Interactable.draggable example
         |     max: Infinity,
         |     maxPerElement: 1,
         | });
        \*/
        resizable: function (options) {
            if (isObject(options)) {
                this.options.resize.enabled = options.enabled === false? false: true;
                this.setPerAction('resize', options);
                this.setOnEvents('resize', options);

                if (/^x$|^y$|^xy$/.test(options.axis)) {
                    this.options.resize.axis = options.axis;
                }
                else if (options.axis === null) {
                    this.options.resize.axis = defaultOptions.resize.axis;
                }

                if (isBool(options.preserveAspectRatio)) {
                    this.options.resize.preserveAspectRatio = options.preserveAspectRatio;
                }
                else if (isBool(options.square)) {
                    this.options.resize.square = options.square;
                }

                return this;
            }
            if (isBool(options)) {
                this.options.resize.enabled = options;

                return this;
            }
            return this.options.resize;
        },

        /*\
         * Interactable.squareResize
         [ method ]
         *
         * Deprecated. Add a `square: true || false` property to @Interactable.resizable instead
         *
         * Gets or sets whether resizing is forced 1:1 aspect
         *
         = (boolean) Current setting
         *
         * or
         *
         - newValue (boolean) #optional
         = (object) this Interactable
        \*/
        squareResize: function (newValue) {
            if (isBool(newValue)) {
                this.options.resize.square = newValue;

                return this;
            }

            if (newValue === null) {
                delete this.options.resize.square;

                return this;
            }

            return this.options.resize.square;
        },

        /*\
         * Interactable.gesturable
         [ method ]
         *
         * Gets or sets whether multitouch gestures can be performed on the
         * Interactable's element
         *
         = (boolean) Indicates if this can be the target of gesture events
         | var isGestureable = interact(element).gesturable();
         * or
         - options (boolean | object) #optional true/false or An object with event listeners to be fired on gesture events (makes the Interactable gesturable)
         = (object) this Interactable
         | interact(element).gesturable({
         |     onstart: function (event) {},
         |     onmove : function (event) {},
         |     onend  : function (event) {},
         |
         |     // limit multiple gestures.
         |     // See the explanation in @Interactable.draggable example
         |     max: Infinity,
         |     maxPerElement: 1,
         | });
        \*/
        gesturable: function (options) {
            if (isObject(options)) {
                this.options.gesture.enabled = options.enabled === false? false: true;
                this.setPerAction('gesture', options);
                this.setOnEvents('gesture', options);

                return this;
            }

            if (isBool(options)) {
                this.options.gesture.enabled = options;

                return this;
            }

            return this.options.gesture;
        },

        /*\
         * Interactable.autoScroll
         [ method ]
         **
         * Deprecated. Add an `autoscroll` property to the options object
         * passed to @Interactable.draggable or @Interactable.resizable instead.
         *
         * Returns or sets whether dragging and resizing near the edges of the
         * window/container trigger autoScroll for this Interactable
         *
         = (object) Object with autoScroll properties
         *
         * or
         *
         - options (object | boolean) #optional
         * options can be:
         * - an object with margin, distance and interval properties,
         * - true or false to enable or disable autoScroll or
         = (Interactable) this Interactable
        \*/
        autoScroll: function (options) {
            if (isObject(options)) {
                options = extend({ actions: ['drag', 'resize']}, options);
            }
            else if (isBool(options)) {
                options = { actions: ['drag', 'resize'], enabled: options };
            }

            return this.setOptions('autoScroll', options);
        },

        /*\
         * Interactable.snap
         [ method ]
         **
         * Deprecated. Add a `snap` property to the options object passed
         * to @Interactable.draggable or @Interactable.resizable instead.
         *
         * Returns or sets if and how action coordinates are snapped. By
         * default, snapping is relative to the pointer coordinates. You can
         * change this by setting the
         * [`elementOrigin`](https://github.com/taye/interact.js/pull/72).
         **
         = (boolean | object) `false` if snap is disabled; object with snap properties if snap is enabled
         **
         * or
         **
         - options (object | boolean | null) #optional
         = (Interactable) this Interactable
         > Usage
         | interact(document.querySelector('#thing')).snap({
         |     targets: [
         |         // snap to this specific point
         |         {
         |             x: 100,
         |             y: 100,
         |             range: 25
         |         },
         |         // give this function the x and y page coords and snap to the object returned
         |         function (x, y) {
         |             return {
         |                 x: x,
         |                 y: (75 + 50 * Math.sin(x * 0.04)),
         |                 range: 40
         |             };
         |         },
         |         // create a function that snaps to a grid
         |         interact.createSnapGrid({
         |             x: 50,
         |             y: 50,
         |             range: 10,              // optional
         |             offset: { x: 5, y: 10 } // optional
         |         })
         |     ],
         |     // do not snap during normal movement.
         |     // Instead, trigger only one snapped move event
         |     // immediately before the end event.
         |     endOnly: true,
         |
         |     relativePoints: [
         |         { x: 0, y: 0 },  // snap relative to the top left of the element
         |         { x: 1, y: 1 },  // and also to the bottom right
         |     ],  
         |
         |     // offset the snap target coordinates
         |     // can be an object with x/y or 'startCoords'
         |     offset: { x: 50, y: 50 }
         |   }
         | });
        \*/
        snap: function (options) {
            var ret = this.setOptions('snap', options);

            if (ret === this) { return this; }

            return ret.drag;
        },

        setOptions: function (option, options) {
            var actions = options && isArray(options.actions)
                    ? options.actions
                    : ['drag'];

            var i;

            if (isObject(options) || isBool(options)) {
                for (i = 0; i < actions.length; i++) {
                    var action = /resize/.test(actions[i])? 'resize' : actions[i];

                    if (!isObject(this.options[action])) { continue; }

                    var thisOption = this.options[action][option];

                    if (isObject(options)) {
                        extend(thisOption, options);
                        thisOption.enabled = options.enabled === false? false: true;

                        if (option === 'snap') {
                            if (thisOption.mode === 'grid') {
                                thisOption.targets = [
                                    interact.createSnapGrid(extend({
                                        offset: thisOption.gridOffset || { x: 0, y: 0 }
                                    }, thisOption.grid || {}))
                                ];
                            }
                            else if (thisOption.mode === 'anchor') {
                                thisOption.targets = thisOption.anchors;
                            }
                            else if (thisOption.mode === 'path') {
                                thisOption.targets = thisOption.paths;
                            }

                            if ('elementOrigin' in options) {
                                thisOption.relativePoints = [options.elementOrigin];
                            }
                        }
                    }
                    else if (isBool(options)) {
                        thisOption.enabled = options;
                    }
                }

                return this;
            }

            var ret = {},
                allActions = ['drag', 'resize', 'gesture'];

            for (i = 0; i < allActions.length; i++) {
                if (option in defaultOptions[allActions[i]]) {
                    ret[allActions[i]] = this.options[allActions[i]][option];
                }
            }

            return ret;
        },


        /*\
         * Interactable.inertia
         [ method ]
         **
         * Deprecated. Add an `inertia` property to the options object passed
         * to @Interactable.draggable or @Interactable.resizable instead.
         *
         * Returns or sets if and how events continue to run after the pointer is released
         **
         = (boolean | object) `false` if inertia is disabled; `object` with inertia properties if inertia is enabled
         **
         * or
         **
         - options (object | boolean | null) #optional
         = (Interactable) this Interactable
         > Usage
         | // enable and use default settings
         | interact(element).inertia(true);
         |
         | // enable and use custom settings
         | interact(element).inertia({
         |     // value greater than 0
         |     // high values slow the object down more quickly
         |     resistance     : 16,
         |
         |     // the minimum launch speed (pixels per second) that results in inertia start
         |     minSpeed       : 200,
         |
         |     // inertia will stop when the object slows down to this speed
         |     endSpeed       : 20,
         |
         |     // boolean; should actions be resumed when the pointer goes down during inertia
         |     allowResume    : true,
         |
         |     // boolean; should the jump when resuming from inertia be ignored in event.dx/dy
         |     zeroResumeDelta: false,
         |
         |     // if snap/restrict are set to be endOnly and inertia is enabled, releasing
         |     // the pointer without triggering inertia will animate from the release
         |     // point to the snaped/restricted point in the given amount of time (ms)
         |     smoothEndDuration: 300,
         |
         |     // an array of action types that can have inertia (no gesture)
         |     actions        : ['drag', 'resize']
         | });
         |
         | // reset custom settings and use all defaults
         | interact(element).inertia(null);
        \*/
        inertia: function (options) {
            var ret = this.setOptions('inertia', options);

            if (ret === this) { return this; }

            return ret.drag;
        },

        getAction: function (pointer, event, interaction, element) {
            var action = this.defaultActionChecker(pointer, interaction, element);

            if (this.options.actionChecker) {
                return this.options.actionChecker(pointer, event, action, this, element, interaction);
            }

            return action;
        },

        defaultActionChecker: defaultActionChecker,

        /*\
         * Interactable.actionChecker
         [ method ]
         *
         * Gets or sets the function used to check action to be performed on
         * pointerDown
         *
         - checker (function | null) #optional A function which takes a pointer event, defaultAction string, interactable, element and interaction as parameters and returns an object with name property 'drag' 'resize' or 'gesture' and optionally an `edges` object with boolean 'top', 'left', 'bottom' and right props.
         = (Function | Interactable) The checker function or this Interactable
         *
         | interact('.resize-drag')
         |   .resizable(true)
         |   .draggable(true)
         |   .actionChecker(function (pointer, event, action, interactable, element, interaction) {
         |
         |   if (interact.matchesSelector(event.target, '.drag-handle') {
         |     // force drag with handle target
         |     action.name = drag;
         |   }
         |   else {
         |     // resize from the top and right edges
         |     action.name  = 'resize';
         |     action.edges = { top: true, right: true };
         |   }
         |
         |   return action;
         | });
        \*/
        actionChecker: function (checker) {
            if (isFunction(checker)) {
                this.options.actionChecker = checker;

                return this;
            }

            if (checker === null) {
                delete this.options.actionChecker;

                return this;
            }

            return this.options.actionChecker;
        },

        /*\
         * Interactable.getRect
         [ method ]
         *
         * The default function to get an Interactables bounding rect. Can be
         * overridden using @Interactable.rectChecker.
         *
         - element (Element) #optional The element to measure.
         = (object) The object's bounding rectangle.
         o {
         o     top   : 0,
         o     left  : 0,
         o     bottom: 0,
         o     right : 0,
         o     width : 0,
         o     height: 0
         o }
        \*/
        getRect: function rectCheck (element) {
            element = element || this._element;

            if (this.selector && !(isElement(element))) {
                element = this._context.querySelector(this.selector);
            }

            return getElementRect(element);
        },

        /*\
         * Interactable.rectChecker
         [ method ]
         *
         * Returns or sets the function used to calculate the interactable's
         * element's rectangle
         *
         - checker (function) #optional A function which returns this Interactable's bounding rectangle. See @Interactable.getRect
         = (function | object) The checker function or this Interactable
        \*/
        rectChecker: function (checker) {
            if (isFunction(checker)) {
                this.getRect = checker;

                return this;
            }

            if (checker === null) {
                delete this.options.getRect;

                return this;
            }

            return this.getRect;
        },

        /*\
         * Interactable.styleCursor
         [ method ]
         *
         * Returns or sets whether the action that would be performed when the
         * mouse on the element are checked on `mousemove` so that the cursor
         * may be styled appropriately
         *
         - newValue (boolean) #optional
         = (boolean | Interactable) The current setting or this Interactable
        \*/
        styleCursor: function (newValue) {
            if (isBool(newValue)) {
                this.options.styleCursor = newValue;

                return this;
            }

            if (newValue === null) {
                delete this.options.styleCursor;

                return this;
            }

            return this.options.styleCursor;
        },

        /*\
         * Interactable.preventDefault
         [ method ]
         *
         * Returns or sets whether to prevent the browser's default behaviour
         * in response to pointer events. Can be set to:
         *  - `'always'` to always prevent
         *  - `'never'` to never prevent
         *  - `'auto'` to let interact.js try to determine what would be best
         *
         - newValue (string) #optional `true`, `false` or `'auto'`
         = (string | Interactable) The current setting or this Interactable
        \*/
        preventDefault: function (newValue) {
            if (/^(always|never|auto)$/.test(newValue)) {
                this.options.preventDefault = newValue;
                return this;
            }

            if (isBool(newValue)) {
                this.options.preventDefault = newValue? 'always' : 'never';
                return this;
            }

            return this.options.preventDefault;
        },

        /*\
         * Interactable.origin
         [ method ]
         *
         * Gets or sets the origin of the Interactable's element.  The x and y
         * of the origin will be subtracted from action event coordinates.
         *
         - origin (object | string) #optional An object eg. { x: 0, y: 0 } or string 'parent', 'self' or any CSS selector
         * OR
         - origin (Element) #optional An HTML or SVG Element whose rect will be used
         **
         = (object) The current origin or this Interactable
        \*/
        origin: function (newValue) {
            if (trySelector(newValue)) {
                this.options.origin = newValue;
                return this;
            }
            else if (isObject(newValue)) {
                this.options.origin = newValue;
                return this;
            }

            return this.options.origin;
        },

        /*\
         * Interactable.deltaSource
         [ method ]
         *
         * Returns or sets the mouse coordinate types used to calculate the
         * movement of the pointer.
         *
         - newValue (string) #optional Use 'client' if you will be scrolling while interacting; Use 'page' if you want autoScroll to work
         = (string | object) The current deltaSource or this Interactable
        \*/
        deltaSource: function (newValue) {
            if (newValue === 'page' || newValue === 'client') {
                this.options.deltaSource = newValue;

                return this;
            }

            return this.options.deltaSource;
        },

        /*\
         * Interactable.restrict
         [ method ]
         **
         * Deprecated. Add a `restrict` property to the options object passed to
         * @Interactable.draggable, @Interactable.resizable or @Interactable.gesturable instead.
         *
         * Returns or sets the rectangles within which actions on this
         * interactable (after snap calculations) are restricted. By default,
         * restricting is relative to the pointer coordinates. You can change
         * this by setting the
         * [`elementRect`](https://github.com/taye/interact.js/pull/72).
         **
         - options (object) #optional an object with keys drag, resize, and/or gesture whose values are rects, Elements, CSS selectors, or 'parent' or 'self'
         = (object) The current restrictions object or this Interactable
         **
         | interact(element).restrict({
         |     // the rect will be `interact.getElementRect(element.parentNode)`
         |     drag: element.parentNode,
         |
         |     // x and y are relative to the the interactable's origin
         |     resize: { x: 100, y: 100, width: 200, height: 200 }
         | })
         |
         | interact('.draggable').restrict({
         |     // the rect will be the selected element's parent
         |     drag: 'parent',
         |
         |     // do not restrict during normal movement.
         |     // Instead, trigger only one restricted move event
         |     // immediately before the end event.
         |     endOnly: true,
         |
         |     // https://github.com/taye/interact.js/pull/72#issue-41813493
         |     elementRect: { top: 0, left: 0, bottom: 1, right: 1 }
         | });
        \*/
        restrict: function (options) {
            if (!isObject(options)) {
                return this.setOptions('restrict', options);
            }

            var actions = ['drag', 'resize', 'gesture'],
                ret;

            for (var i = 0; i < actions.length; i++) {
                var action = actions[i];

                if (action in options) {
                    var perAction = extend({
                            actions: [action],
                            restriction: options[action]
                        }, options);

                    ret = this.setOptions('restrict', perAction);
                }
            }

            return ret;
        },

        /*\
         * Interactable.context
         [ method ]
         *
         * Gets the selector context Node of the Interactable. The default is `window.document`.
         *
         = (Node) The context Node of this Interactable
         **
        \*/
        context: function () {
            return this._context;
        },

        _context: document,

        /*\
         * Interactable.ignoreFrom
         [ method ]
         *
         * If the target of the `mousedown`, `pointerdown` or `touchstart`
         * event or any of it's parents match the given CSS selector or
         * Element, no drag/resize/gesture is started.
         *
         - newValue (string | Element | null) #optional a CSS selector string, an Element or `null` to not ignore any elements
         = (string | Element | object) The current ignoreFrom value or this Interactable
         **
         | interact(element, { ignoreFrom: document.getElementById('no-action') });
         | // or
         | interact(element).ignoreFrom('input, textarea, a');
        \*/
        ignoreFrom: function (newValue) {
            if (trySelector(newValue)) {            // CSS selector to match event.target
                this.options.ignoreFrom = newValue;
                return this;
            }

            if (isElement(newValue)) {              // specific element
                this.options.ignoreFrom = newValue;
                return this;
            }

            return this.options.ignoreFrom;
        },

        /*\
         * Interactable.allowFrom
         [ method ]
         *
         * A drag/resize/gesture is started only If the target of the
         * `mousedown`, `pointerdown` or `touchstart` event or any of it's
         * parents match the given CSS selector or Element.
         *
         - newValue (string | Element | null) #optional a CSS selector string, an Element or `null` to allow from any element
         = (string | Element | object) The current allowFrom value or this Interactable
         **
         | interact(element, { allowFrom: document.getElementById('drag-handle') });
         | // or
         | interact(element).allowFrom('.handle');
        \*/
        allowFrom: function (newValue) {
            if (trySelector(newValue)) {            // CSS selector to match event.target
                this.options.allowFrom = newValue;
                return this;
            }

            if (isElement(newValue)) {              // specific element
                this.options.allowFrom = newValue;
                return this;
            }

            return this.options.allowFrom;
        },

        /*\
         * Interactable.element
         [ method ]
         *
         * If this is not a selector Interactable, it returns the element this
         * interactable represents
         *
         = (Element) HTML / SVG Element
        \*/
        element: function () {
            return this._element;
        },

        /*\
         * Interactable.fire
         [ method ]
         *
         * Calls listeners for the given InteractEvent type bound globally
         * and directly to this Interactable
         *
         - iEvent (InteractEvent) The InteractEvent object to be fired on this Interactable
         = (Interactable) this Interactable
        \*/
        fire: function (iEvent) {
            if (!(iEvent && iEvent.type) || !contains(eventTypes, iEvent.type)) {
                return this;
            }

            var listeners,
                i,
                len,
                onEvent = 'on' + iEvent.type,
                funcName = '';

            // Interactable#on() listeners
            if (iEvent.type in this._iEvents) {
                listeners = this._iEvents[iEvent.type];

                for (i = 0, len = listeners.length; i < len && !iEvent.immediatePropagationStopped; i++) {
                    funcName = listeners[i].name;
                    listeners[i](iEvent);
                }
            }

            // interactable.onevent listener
            if (isFunction(this[onEvent])) {
                funcName = this[onEvent].name;
                this[onEvent](iEvent);
            }

            // interact.on() listeners
            if (iEvent.type in globalEvents && (listeners = globalEvents[iEvent.type]))  {

                for (i = 0, len = listeners.length; i < len && !iEvent.immediatePropagationStopped; i++) {
                    funcName = listeners[i].name;
                    listeners[i](iEvent);
                }
            }

            return this;
        },

        /*\
         * Interactable.on
         [ method ]
         *
         * Binds a listener for an InteractEvent or DOM event.
         *
         - eventType  (string | array | object) The types of events to listen for
         - listener   (function) The function to be called on the given event(s)
         - useCapture (boolean) #optional useCapture flag for addEventListener
         = (object) This Interactable
        \*/
        on: function (eventType, listener, useCapture) {
            var i;

            if (isString(eventType) && eventType.search(' ') !== -1) {
                eventType = eventType.trim().split(/ +/);
            }

            if (isArray(eventType)) {
                for (i = 0; i < eventType.length; i++) {
                    this.on(eventType[i], listener, useCapture);
                }

                return this;
            }

            if (isObject(eventType)) {
                for (var prop in eventType) {
                    this.on(prop, eventType[prop], listener);
                }

                return this;
            }

            if (eventType === 'wheel') {
                eventType = wheelEvent;
            }

            // convert to boolean
            useCapture = useCapture? true: false;

            if (contains(eventTypes, eventType)) {
                // if this type of event was never bound to this Interactable
                if (!(eventType in this._iEvents)) {
                    this._iEvents[eventType] = [listener];
                }
                else {
                    this._iEvents[eventType].push(listener);
                }
            }
            // delegated event for selector
            else if (this.selector) {
                if (!delegatedEvents[eventType]) {
                    delegatedEvents[eventType] = {
                        selectors: [],
                        contexts : [],
                        listeners: []
                    };

                    // add delegate listener functions
                    for (i = 0; i < documents.length; i++) {
                        events.add(documents[i], eventType, delegateListener);
                        events.add(documents[i], eventType, delegateUseCapture, true);
                    }
                }

                var delegated = delegatedEvents[eventType],
                    index;

                for (index = delegated.selectors.length - 1; index >= 0; index--) {
                    if (delegated.selectors[index] === this.selector
                        && delegated.contexts[index] === this._context) {
                        break;
                    }
                }

                if (index === -1) {
                    index = delegated.selectors.length;

                    delegated.selectors.push(this.selector);
                    delegated.contexts .push(this._context);
                    delegated.listeners.push([]);
                }

                // keep listener and useCapture flag
                delegated.listeners[index].push([listener, useCapture]);
            }
            else {
                events.add(this._element, eventType, listener, useCapture);
            }

            return this;
        },

        /*\
         * Interactable.off
         [ method ]
         *
         * Removes an InteractEvent or DOM event listener
         *
         - eventType  (string | array | object) The types of events that were listened for
         - listener   (function) The listener function to be removed
         - useCapture (boolean) #optional useCapture flag for removeEventListener
         = (object) This Interactable
        \*/
        off: function (eventType, listener, useCapture) {
            var i;

            if (isString(eventType) && eventType.search(' ') !== -1) {
                eventType = eventType.trim().split(/ +/);
            }

            if (isArray(eventType)) {
                for (i = 0; i < eventType.length; i++) {
                    this.off(eventType[i], listener, useCapture);
                }

                return this;
            }

            if (isObject(eventType)) {
                for (var prop in eventType) {
                    this.off(prop, eventType[prop], listener);
                }

                return this;
            }

            var eventList,
                index = -1;

            // convert to boolean
            useCapture = useCapture? true: false;

            if (eventType === 'wheel') {
                eventType = wheelEvent;
            }

            // if it is an action event type
            if (contains(eventTypes, eventType)) {
                eventList = this._iEvents[eventType];

                if (eventList && (index = indexOf(eventList, listener)) !== -1) {
                    this._iEvents[eventType].splice(index, 1);
                }
            }
            // delegated event
            else if (this.selector) {
                var delegated = delegatedEvents[eventType],
                    matchFound = false;

                if (!delegated) { return this; }

                // count from last index of delegated to 0
                for (index = delegated.selectors.length - 1; index >= 0; index--) {
                    // look for matching selector and context Node
                    if (delegated.selectors[index] === this.selector
                        && delegated.contexts[index] === this._context) {

                        var listeners = delegated.listeners[index];

                        // each item of the listeners array is an array: [function, useCaptureFlag]
                        for (i = listeners.length - 1; i >= 0; i--) {
                            var fn = listeners[i][0],
                                useCap = listeners[i][1];

                            // check if the listener functions and useCapture flags match
                            if (fn === listener && useCap === useCapture) {
                                // remove the listener from the array of listeners
                                listeners.splice(i, 1);

                                // if all listeners for this interactable have been removed
                                // remove the interactable from the delegated arrays
                                if (!listeners.length) {
                                    delegated.selectors.splice(index, 1);
                                    delegated.contexts .splice(index, 1);
                                    delegated.listeners.splice(index, 1);

                                    // remove delegate function from context
                                    events.remove(this._context, eventType, delegateListener);
                                    events.remove(this._context, eventType, delegateUseCapture, true);

                                    // remove the arrays if they are empty
                                    if (!delegated.selectors.length) {
                                        delegatedEvents[eventType] = null;
                                    }
                                }

                                // only remove one listener
                                matchFound = true;
                                break;
                            }
                        }

                        if (matchFound) { break; }
                    }
                }
            }
            // remove listener from this Interatable's element
            else {
                events.remove(this._element, eventType, listener, useCapture);
            }

            return this;
        },

        /*\
         * Interactable.set
         [ method ]
         *
         * Reset the options of this Interactable
         - options (object) The new settings to apply
         = (object) This Interactable
        \*/
        set: function (options) {
            if (!isObject(options)) {
                options = {};
            }

            this.options = extend({}, defaultOptions.base);

            var i,
                actions = ['drag', 'drop', 'resize', 'gesture'],
                methods = ['draggable', 'dropzone', 'resizable', 'gesturable'],
                perActions = extend(extend({}, defaultOptions.perAction), options[action] || {});

            for (i = 0; i < actions.length; i++) {
                var action = actions[i];

                this.options[action] = extend({}, defaultOptions[action]);

                this.setPerAction(action, perActions);

                this[methods[i]](options[action]);
            }

            var settings = [
                    'accept', 'actionChecker', 'allowFrom', 'deltaSource',
                    'dropChecker', 'ignoreFrom', 'origin', 'preventDefault',
                    'rectChecker', 'styleCursor'
                ];

            for (i = 0, len = settings.length; i < len; i++) {
                var setting = settings[i];

                this.options[setting] = defaultOptions.base[setting];

                if (setting in options) {
                    this[setting](options[setting]);
                }
            }

            return this;
        },

        /*\
         * Interactable.unset
         [ method ]
         *
         * Remove this interactable from the list of interactables and remove
         * it's drag, drop, resize and gesture capabilities
         *
         = (object) @interact
        \*/
        unset: function () {
            events.remove(this._element, 'all');

            if (!isString(this.selector)) {
                events.remove(this, 'all');
                if (this.options.styleCursor) {
                    this._element.style.cursor = '';
                }
            }
            else {
                // remove delegated events
                for (var type in delegatedEvents) {
                    var delegated = delegatedEvents[type];

                    for (var i = 0; i < delegated.selectors.length; i++) {
                        if (delegated.selectors[i] === this.selector
                            && delegated.contexts[i] === this._context) {

                            delegated.selectors.splice(i, 1);
                            delegated.contexts .splice(i, 1);
                            delegated.listeners.splice(i, 1);

                            // remove the arrays if they are empty
                            if (!delegated.selectors.length) {
                                delegatedEvents[type] = null;
                            }
                        }

                        events.remove(this._context, type, delegateListener);
                        events.remove(this._context, type, delegateUseCapture, true);

                        break;
                    }
                }
            }

            this.dropzone(false);

            interactables.splice(indexOf(interactables, this), 1);

            return interact;
        }
    };

    function warnOnce (method, message) {
        var warned = false;

        return function () {
            if (!warned) {
                window.console.warn(message);
                warned = true;
            }

            return method.apply(this, arguments);
        };
    }

    Interactable.prototype.snap = warnOnce(Interactable.prototype.snap,
         'Interactable#snap is deprecated. See the new documentation for snapping at http://interactjs.io/docs/snapping');
    Interactable.prototype.restrict = warnOnce(Interactable.prototype.restrict,
         'Interactable#restrict is deprecated. See the new documentation for resticting at http://interactjs.io/docs/restriction');
    Interactable.prototype.inertia = warnOnce(Interactable.prototype.inertia,
         'Interactable#inertia is deprecated. See the new documentation for inertia at http://interactjs.io/docs/inertia');
    Interactable.prototype.autoScroll = warnOnce(Interactable.prototype.autoScroll,
         'Interactable#autoScroll is deprecated. See the new documentation for autoScroll at http://interactjs.io/docs/#autoscroll');
    Interactable.prototype.squareResize = warnOnce(Interactable.prototype.squareResize,
         'Interactable#squareResize is deprecated. See http://interactjs.io/docs/#resize-square');

    Interactable.prototype.accept = warnOnce(Interactable.prototype.accept,
         'Interactable#accept is deprecated. use Interactable#dropzone({ accept: target }) instead');
    Interactable.prototype.dropChecker = warnOnce(Interactable.prototype.dropChecker,
         'Interactable#dropChecker is deprecated. use Interactable#dropzone({ dropChecker: checkerFunction }) instead');
    Interactable.prototype.context = warnOnce(Interactable.prototype.context,
         'Interactable#context as a method is deprecated. It will soon be a DOM Node instead');

    /*\
     * interact.isSet
     [ method ]
     *
     * Check if an element has been set
     - element (Element) The Element being searched for
     = (boolean) Indicates if the element or CSS selector was previously passed to interact
    \*/
    interact.isSet = function(element, options) {
        return interactables.indexOfElement(element, options && options.context) !== -1;
    };

    /*\
     * interact.on
     [ method ]
     *
     * Adds a global listener for an InteractEvent or adds a DOM event to
     * `document`
     *
     - type       (string | array | object) The types of events to listen for
     - listener   (function) The function to be called on the given event(s)
     - useCapture (boolean) #optional useCapture flag for addEventListener
     = (object) interact
    \*/
    interact.on = function (type, listener, useCapture) {
        if (isString(type) && type.search(' ') !== -1) {
            type = type.trim().split(/ +/);
        }

        if (isArray(type)) {
            for (var i = 0; i < type.length; i++) {
                interact.on(type[i], listener, useCapture);
            }

            return interact;
        }

        if (isObject(type)) {
            for (var prop in type) {
                interact.on(prop, type[prop], listener);
            }

            return interact;
        }

        // if it is an InteractEvent type, add listener to globalEvents
        if (contains(eventTypes, type)) {
            // if this type of event was never bound
            if (!globalEvents[type]) {
                globalEvents[type] = [listener];
            }
            else {
                globalEvents[type].push(listener);
            }
        }
        // If non InteractEvent type, addEventListener to document
        else {
            events.add(document, type, listener, useCapture);
        }

        return interact;
    };

    /*\
     * interact.off
     [ method ]
     *
     * Removes a global InteractEvent listener or DOM event from `document`
     *
     - type       (string | array | object) The types of events that were listened for
     - listener   (function) The listener function to be removed
     - useCapture (boolean) #optional useCapture flag for removeEventListener
     = (object) interact
     \*/
    interact.off = function (type, listener, useCapture) {
        if (isString(type) && type.search(' ') !== -1) {
            type = type.trim().split(/ +/);
        }

        if (isArray(type)) {
            for (var i = 0; i < type.length; i++) {
                interact.off(type[i], listener, useCapture);
            }

            return interact;
        }

        if (isObject(type)) {
            for (var prop in type) {
                interact.off(prop, type[prop], listener);
            }

            return interact;
        }

        if (!contains(eventTypes, type)) {
            events.remove(document, type, listener, useCapture);
        }
        else {
            var index;

            if (type in globalEvents
                && (index = indexOf(globalEvents[type], listener)) !== -1) {
                globalEvents[type].splice(index, 1);
            }
        }

        return interact;
    };

    /*\
     * interact.enableDragging
     [ method ]
     *
     * Deprecated.
     *
     * Returns or sets whether dragging is enabled for any Interactables
     *
     - newValue (boolean) #optional `true` to allow the action; `false` to disable action for all Interactables
     = (boolean | object) The current setting or interact
    \*/
    interact.enableDragging = warnOnce(function (newValue) {
        if (newValue !== null && newValue !== undefined) {
            actionIsEnabled.drag = newValue;

            return interact;
        }
        return actionIsEnabled.drag;
    }, 'interact.enableDragging is deprecated and will soon be removed.');

    /*\
     * interact.enableResizing
     [ method ]
     *
     * Deprecated.
     *
     * Returns or sets whether resizing is enabled for any Interactables
     *
     - newValue (boolean) #optional `true` to allow the action; `false` to disable action for all Interactables
     = (boolean | object) The current setting or interact
    \*/
    interact.enableResizing = warnOnce(function (newValue) {
        if (newValue !== null && newValue !== undefined) {
            actionIsEnabled.resize = newValue;

            return interact;
        }
        return actionIsEnabled.resize;
    }, 'interact.enableResizing is deprecated and will soon be removed.');

    /*\
     * interact.enableGesturing
     [ method ]
     *
     * Deprecated.
     *
     * Returns or sets whether gesturing is enabled for any Interactables
     *
     - newValue (boolean) #optional `true` to allow the action; `false` to disable action for all Interactables
     = (boolean | object) The current setting or interact
    \*/
    interact.enableGesturing = warnOnce(function (newValue) {
        if (newValue !== null && newValue !== undefined) {
            actionIsEnabled.gesture = newValue;

            return interact;
        }
        return actionIsEnabled.gesture;
    }, 'interact.enableGesturing is deprecated and will soon be removed.');

    interact.eventTypes = eventTypes;

    /*\
     * interact.debug
     [ method ]
     *
     * Returns debugging data
     = (object) An object with properties that outline the current state and expose internal functions and variables
    \*/
    interact.debug = function () {
        var interaction = interactions[0] || new Interaction();

        return {
            interactions          : interactions,
            target                : interaction.target,
            dragging              : interaction.dragging,
            resizing              : interaction.resizing,
            gesturing             : interaction.gesturing,
            prepared              : interaction.prepared,
            matches               : interaction.matches,
            matchElements         : interaction.matchElements,

            prevCoords            : interaction.prevCoords,
            startCoords           : interaction.startCoords,

            pointerIds            : interaction.pointerIds,
            pointers              : interaction.pointers,
            addPointer            : listeners.addPointer,
            removePointer         : listeners.removePointer,
            recordPointer        : listeners.recordPointer,

            snap                  : interaction.snapStatus,
            restrict              : interaction.restrictStatus,
            inertia               : interaction.inertiaStatus,

            downTime              : interaction.downTimes[0],
            downEvent             : interaction.downEvent,
            downPointer           : interaction.downPointer,
            prevEvent             : interaction.prevEvent,

            Interactable          : Interactable,
            interactables         : interactables,
            pointerIsDown         : interaction.pointerIsDown,
            defaultOptions        : defaultOptions,
            defaultActionChecker  : defaultActionChecker,

            actionCursors         : actionCursors,
            dragMove              : listeners.dragMove,
            resizeMove            : listeners.resizeMove,
            gestureMove           : listeners.gestureMove,
            pointerUp             : listeners.pointerUp,
            pointerDown           : listeners.pointerDown,
            pointerMove           : listeners.pointerMove,
            pointerHover          : listeners.pointerHover,

            eventTypes            : eventTypes,

            events                : events,
            globalEvents          : globalEvents,
            delegatedEvents       : delegatedEvents,

            prefixedPropREs       : prefixedPropREs
        };
    };

    // expose the functions used to calculate multi-touch properties
    interact.getPointerAverage = pointerAverage;
    interact.getTouchBBox     = touchBBox;
    interact.getTouchDistance = touchDistance;
    interact.getTouchAngle    = touchAngle;

    interact.getElementRect         = getElementRect;
    interact.getElementClientRect   = getElementClientRect;
    interact.matchesSelector        = matchesSelector;
    interact.closest                = closest;

    /*\
     * interact.margin
     [ method ]
     *
     * Deprecated. Use `interact(target).resizable({ margin: number });` instead.
     * Returns or sets the margin for autocheck resizing used in
     * @Interactable.getAction. That is the distance from the bottom and right
     * edges of an element clicking in which will start resizing
     *
     - newValue (number) #optional
     = (number | interact) The current margin value or interact
    \*/
    interact.margin = warnOnce(function (newvalue) {
        if (isNumber(newvalue)) {
            margin = newvalue;

            return interact;
        }
        return margin;
    },
    'interact.margin is deprecated. Use interact(target).resizable({ margin: number }); instead.') ;

    /*\
     * interact.supportsTouch
     [ method ]
     *
     = (boolean) Whether or not the browser supports touch input
    \*/
    interact.supportsTouch = function () {
        return supportsTouch;
    };

    /*\
     * interact.supportsPointerEvent
     [ method ]
     *
     = (boolean) Whether or not the browser supports PointerEvents
    \*/
    interact.supportsPointerEvent = function () {
        return supportsPointerEvent;
    };

    /*\
     * interact.stop
     [ method ]
     *
     * Cancels all interactions (end events are not fired)
     *
     - event (Event) An event on which to call preventDefault()
     = (object) interact
    \*/
    interact.stop = function (event) {
        for (var i = interactions.length - 1; i >= 0; i--) {
            interactions[i].stop(event);
        }

        return interact;
    };

    /*\
     * interact.dynamicDrop
     [ method ]
     *
     * Returns or sets whether the dimensions of dropzone elements are
     * calculated on every dragmove or only on dragstart for the default
     * dropChecker
     *
     - newValue (boolean) #optional True to check on each move. False to check only before start
     = (boolean | interact) The current setting or interact
    \*/
    interact.dynamicDrop = function (newValue) {
        if (isBool(newValue)) {
            //if (dragging && dynamicDrop !== newValue && !newValue) {
                //calcRects(dropzones);
            //}

            dynamicDrop = newValue;

            return interact;
        }
        return dynamicDrop;
    };

    /*\
     * interact.pointerMoveTolerance
     [ method ]
     * Returns or sets the distance the pointer must be moved before an action
     * sequence occurs. This also affects tolerance for tap events.
     *
     - newValue (number) #optional The movement from the start position must be greater than this value
     = (number | Interactable) The current setting or interact
    \*/
    interact.pointerMoveTolerance = function (newValue) {
        if (isNumber(newValue)) {
            pointerMoveTolerance = newValue;

            return this;
        }

        return pointerMoveTolerance;
    };

    /*\
     * interact.maxInteractions
     [ method ]
     **
     * Returns or sets the maximum number of concurrent interactions allowed.
     * By default only 1 interaction is allowed at a time (for backwards
     * compatibility). To allow multiple interactions on the same Interactables
     * and elements, you need to enable it in the draggable, resizable and
     * gesturable `'max'` and `'maxPerElement'` options.
     **
     - newValue (number) #optional Any number. newValue <= 0 means no interactions.
    \*/
    interact.maxInteractions = function (newValue) {
        if (isNumber(newValue)) {
            maxInteractions = newValue;

            return this;
        }

        return maxInteractions;
    };

    interact.createSnapGrid = function (grid) {
        return function (x, y) {
            var offsetX = 0,
                offsetY = 0;

            if (isObject(grid.offset)) {
                offsetX = grid.offset.x;
                offsetY = grid.offset.y;
            }

            var gridx = Math.round((x - offsetX) / grid.x),
                gridy = Math.round((y - offsetY) / grid.y),

                newX = gridx * grid.x + offsetX,
                newY = gridy * grid.y + offsetY;

            return {
                x: newX,
                y: newY,
                range: grid.range
            };
        };
    };

    function endAllInteractions (event) {
        for (var i = 0; i < interactions.length; i++) {
            interactions[i].pointerEnd(event, event);
        }
    }

    function listenToDocument (doc) {
        if (contains(documents, doc)) { return; }

        var win = doc.defaultView || doc.parentWindow;

        // add delegate event listener
        for (var eventType in delegatedEvents) {
            events.add(doc, eventType, delegateListener);
            events.add(doc, eventType, delegateUseCapture, true);
        }

        if (PointerEvent) {
            if (PointerEvent === win.MSPointerEvent) {
                pEventTypes = {
                    up: 'MSPointerUp', down: 'MSPointerDown', over: 'mouseover',
                    out: 'mouseout', move: 'MSPointerMove', cancel: 'MSPointerCancel' };
            }
            else {
                pEventTypes = {
                    up: 'pointerup', down: 'pointerdown', over: 'pointerover',
                    out: 'pointerout', move: 'pointermove', cancel: 'pointercancel' };
            }

            events.add(doc, pEventTypes.down  , listeners.selectorDown );
            events.add(doc, pEventTypes.move  , listeners.pointerMove  );
            events.add(doc, pEventTypes.over  , listeners.pointerOver  );
            events.add(doc, pEventTypes.out   , listeners.pointerOut   );
            events.add(doc, pEventTypes.up    , listeners.pointerUp    );
            events.add(doc, pEventTypes.cancel, listeners.pointerCancel);

            // autoscroll
            events.add(doc, pEventTypes.move, listeners.autoScrollMove);
        }
        else {
            events.add(doc, 'mousedown', listeners.selectorDown);
            events.add(doc, 'mousemove', listeners.pointerMove );
            events.add(doc, 'mouseup'  , listeners.pointerUp   );
            events.add(doc, 'mouseover', listeners.pointerOver );
            events.add(doc, 'mouseout' , listeners.pointerOut  );

            events.add(doc, 'touchstart' , listeners.selectorDown );
            events.add(doc, 'touchmove'  , listeners.pointerMove  );
            events.add(doc, 'touchend'   , listeners.pointerUp    );
            events.add(doc, 'touchcancel', listeners.pointerCancel);

            // autoscroll
            events.add(doc, 'mousemove', listeners.autoScrollMove);
            events.add(doc, 'touchmove', listeners.autoScrollMove);
        }

        events.add(win, 'blur', endAllInteractions);

        try {
            if (win.frameElement) {
                var parentDoc = win.frameElement.ownerDocument,
                    parentWindow = parentDoc.defaultView;

                events.add(parentDoc   , 'mouseup'      , listeners.pointerEnd);
                events.add(parentDoc   , 'touchend'     , listeners.pointerEnd);
                events.add(parentDoc   , 'touchcancel'  , listeners.pointerEnd);
                events.add(parentDoc   , 'pointerup'    , listeners.pointerEnd);
                events.add(parentDoc   , 'MSPointerUp'  , listeners.pointerEnd);
                events.add(parentWindow, 'blur'         , endAllInteractions );
            }
        }
        catch (error) {
            interact.windowParentError = error;
        }

        // prevent native HTML5 drag on interact.js target elements
        events.add(doc, 'dragstart', function (event) {
            for (var i = 0; i < interactions.length; i++) {
                var interaction = interactions[i];

                if (interaction.element
                    && (interaction.element === event.target
                        || nodeContains(interaction.element, event.target))) {

                    interaction.checkAndPreventDefault(event, interaction.target, interaction.element);
                    return;
                }
            }
        });

        if (events.useAttachEvent) {
            // For IE's lack of Event#preventDefault
            events.add(doc, 'selectstart', function (event) {
                var interaction = interactions[0];

                if (interaction.currentAction()) {
                    interaction.checkAndPreventDefault(event);
                }
            });

            // For IE's bad dblclick event sequence
            events.add(doc, 'dblclick', doOnInteractions('ie8Dblclick'));
        }

        documents.push(doc);
    }

    listenToDocument(document);

    function indexOf (array, target) {
        for (var i = 0, len = array.length; i < len; i++) {
            if (array[i] === target) {
                return i;
            }
        }

        return -1;
    }

    function contains (array, target) {
        return indexOf(array, target) !== -1;
    }

    function matchesSelector (element, selector, nodeList) {
        if (ie8MatchesSelector) {
            return ie8MatchesSelector(element, selector, nodeList);
        }

        // remove /deep/ from selectors if shadowDOM polyfill is used
        if (window !== realWindow) {
            selector = selector.replace(/\/deep\//g, ' ');
        }

        return element[prefixedMatchesSelector](selector);
    }

    function matchesUpTo (element, selector, limit) {
        while (isElement(element)) {
            if (matchesSelector(element, selector)) {
                return true;
            }

            element = parentElement(element);

            if (element === limit) {
                return matchesSelector(element, selector);
            }
        }

        return false;
    }

    // For IE8's lack of an Element#matchesSelector
    // taken from http://tanalin.com/en/blog/2012/12/matches-selector-ie8/ and modified
    if (!(prefixedMatchesSelector in Element.prototype) || !isFunction(Element.prototype[prefixedMatchesSelector])) {
        ie8MatchesSelector = function (element, selector, elems) {
            elems = elems || element.parentNode.querySelectorAll(selector);

            for (var i = 0, len = elems.length; i < len; i++) {
                if (elems[i] === element) {
                    return true;
                }
            }

            return false;
        };
    }

    // requestAnimationFrame polyfill
    (function() {
        var lastTime = 0,
            vendors = ['ms', 'moz', 'webkit', 'o'];

        for(var x = 0; x < vendors.length && !realWindow.requestAnimationFrame; ++x) {
            reqFrame = realWindow[vendors[x]+'RequestAnimationFrame'];
            cancelFrame = realWindow[vendors[x]+'CancelAnimationFrame'] || realWindow[vendors[x]+'CancelRequestAnimationFrame'];
        }

        if (!reqFrame) {
            reqFrame = function(callback) {
                var currTime = new Date().getTime(),
                    timeToCall = Math.max(0, 16 - (currTime - lastTime)),
                    id = setTimeout(function() { callback(currTime + timeToCall); },
                  timeToCall);
                lastTime = currTime + timeToCall;
                return id;
            };
        }

        if (!cancelFrame) {
            cancelFrame = function(id) {
                clearTimeout(id);
            };
        }
    }());

    /* global exports: true, module, define */

    // http://documentcloud.github.io/underscore/docs/underscore.html#section-11
    if (typeof exports !== 'undefined') {
        if (typeof module !== 'undefined' && module.exports) {
            exports = module.exports = interact;
        }
        exports.interact = interact;
    }
    // AMD
    else if (typeof define === 'function' && define.amd) {
        define('interact', function() {
            return interact;
        });
    }
    else {
        realWindow.interact = interact;
    }

} (typeof window === 'undefined'? undefined : window));

},{}],2:[function(require,module,exports){
var isObject = require('./isObject'),
    now = require('./now'),
    toNumber = require('./toNumber');

/** Used as the `TypeError` message for "Functions" methods. */
var FUNC_ERROR_TEXT = 'Expected a function';

/* Built-in method references for those with the same name as other `lodash` methods. */
var nativeMax = Math.max;

/**
 * Creates a debounced function that delays invoking `func` until after `wait`
 * milliseconds have elapsed since the last time the debounced function was
 * invoked. The debounced function comes with a `cancel` method to cancel
 * delayed `func` invocations and a `flush` method to immediately invoke them.
 * Provide an options object to indicate whether `func` should be invoked on
 * the leading and/or trailing edge of the `wait` timeout. The `func` is invoked
 * with the last arguments provided to the debounced function. Subsequent calls
 * to the debounced function return the result of the last `func` invocation.
 *
 * **Note:** If `leading` and `trailing` options are `true`, `func` is invoked
 * on the trailing edge of the timeout only if the debounced function is
 * invoked more than once during the `wait` timeout.
 *
 * See [David Corbacho's article](http://drupalmotion.com/article/debounce-and-throttle-visual-explanation)
 * for details over the differences between `_.debounce` and `_.throttle`.
 *
 * @static
 * @memberOf _
 * @category Function
 * @param {Function} func The function to debounce.
 * @param {number} [wait=0] The number of milliseconds to delay.
 * @param {Object} [options] The options object.
 * @param {boolean} [options.leading=false] Specify invoking on the leading
 *  edge of the timeout.
 * @param {number} [options.maxWait] The maximum time `func` is allowed to be
 *  delayed before it's invoked.
 * @param {boolean} [options.trailing=true] Specify invoking on the trailing
 *  edge of the timeout.
 * @returns {Function} Returns the new debounced function.
 * @example
 *
 * // Avoid costly calculations while the window size is in flux.
 * jQuery(window).on('resize', _.debounce(calculateLayout, 150));
 *
 * // Invoke `sendMail` when clicked, debouncing subsequent calls.
 * jQuery(element).on('click', _.debounce(sendMail, 300, {
 *   'leading': true,
 *   'trailing': false
 * }));
 *
 * // Ensure `batchLog` is invoked once after 1 second of debounced calls.
 * var debounced = _.debounce(batchLog, 250, { 'maxWait': 1000 });
 * var source = new EventSource('/stream');
 * jQuery(source).on('message', debounced);
 *
 * // Cancel the trailing debounced invocation.
 * jQuery(window).on('popstate', debounced.cancel);
 */
function debounce(func, wait, options) {
  var args,
      maxTimeoutId,
      result,
      stamp,
      thisArg,
      timeoutId,
      trailingCall,
      lastCalled = 0,
      leading = false,
      maxWait = false,
      trailing = true;

  if (typeof func != 'function') {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  wait = toNumber(wait) || 0;
  if (isObject(options)) {
    leading = !!options.leading;
    maxWait = 'maxWait' in options && nativeMax(toNumber(options.maxWait) || 0, wait);
    trailing = 'trailing' in options ? !!options.trailing : trailing;
  }

  function cancel() {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (maxTimeoutId) {
      clearTimeout(maxTimeoutId);
    }
    lastCalled = 0;
    args = maxTimeoutId = thisArg = timeoutId = trailingCall = undefined;
  }

  function complete(isCalled, id) {
    if (id) {
      clearTimeout(id);
    }
    maxTimeoutId = timeoutId = trailingCall = undefined;
    if (isCalled) {
      lastCalled = now();
      result = func.apply(thisArg, args);
      if (!timeoutId && !maxTimeoutId) {
        args = thisArg = undefined;
      }
    }
  }

  function delayed() {
    var remaining = wait - (now() - stamp);
    if (remaining <= 0 || remaining > wait) {
      complete(trailingCall, maxTimeoutId);
    } else {
      timeoutId = setTimeout(delayed, remaining);
    }
  }

  function flush() {
    if ((timeoutId && trailingCall) || (maxTimeoutId && trailing)) {
      result = func.apply(thisArg, args);
    }
    cancel();
    return result;
  }

  function maxDelayed() {
    complete(trailing, timeoutId);
  }

  function debounced() {
    args = arguments;
    stamp = now();
    thisArg = this;
    trailingCall = trailing && (timeoutId || !leading);

    if (maxWait === false) {
      var leadingCall = leading && !timeoutId;
    } else {
      if (!lastCalled && !maxTimeoutId && !leading) {
        lastCalled = stamp;
      }
      var remaining = maxWait - (stamp - lastCalled);

      var isCalled = (remaining <= 0 || remaining > maxWait) &&
        (leading || maxTimeoutId);

      if (isCalled) {
        if (maxTimeoutId) {
          maxTimeoutId = clearTimeout(maxTimeoutId);
        }
        lastCalled = stamp;
        result = func.apply(thisArg, args);
      }
      else if (!maxTimeoutId) {
        maxTimeoutId = setTimeout(maxDelayed, remaining);
      }
    }
    if (isCalled && timeoutId) {
      timeoutId = clearTimeout(timeoutId);
    }
    else if (!timeoutId && wait !== maxWait) {
      timeoutId = setTimeout(delayed, wait);
    }
    if (leadingCall) {
      isCalled = true;
      result = func.apply(thisArg, args);
    }
    if (isCalled && !timeoutId && !maxTimeoutId) {
      args = thisArg = undefined;
    }
    return result;
  }
  debounced.cancel = cancel;
  debounced.flush = flush;
  return debounced;
}

module.exports = debounce;

},{"./isObject":4,"./now":5,"./toNumber":7}],3:[function(require,module,exports){
var isObject = require('./isObject');

/** `Object#toString` result references. */
var funcTag = '[object Function]',
    genTag = '[object GeneratorFunction]';

/** Used for built-in method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString = objectProto.toString;

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction(value) {
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in Safari 8 which returns 'object' for typed array constructors, and
  // PhantomJS 1.9 which returns 'function' for `NodeList` instances.
  var tag = isObject(value) ? objectToString.call(value) : '';
  return tag == funcTag || tag == genTag;
}

module.exports = isFunction;

},{"./isObject":4}],4:[function(require,module,exports){
/**
 * Checks if `value` is the [language type](https://es5.github.io/#x8) of `Object`.
 * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(_.noop);
 * // => true
 *
 * _.isObject(null);
 * // => false
 */
function isObject(value) {
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

module.exports = isObject;

},{}],5:[function(require,module,exports){
/**
 * Gets the timestamp of the number of milliseconds that have elapsed since
 * the Unix epoch (1 January 1970 00:00:00 UTC).
 *
 * @static
 * @memberOf _
 * @type {Function}
 * @category Date
 * @returns {number} Returns the timestamp.
 * @example
 *
 * _.defer(function(stamp) {
 *   console.log(_.now() - stamp);
 * }, _.now());
 * // => logs the number of milliseconds it took for the deferred function to be invoked
 */
var now = Date.now;

module.exports = now;

},{}],6:[function(require,module,exports){
var debounce = require('./debounce'),
    isObject = require('./isObject');

/** Used as the `TypeError` message for "Functions" methods. */
var FUNC_ERROR_TEXT = 'Expected a function';

/**
 * Creates a throttled function that only invokes `func` at most once per
 * every `wait` milliseconds. The throttled function comes with a `cancel`
 * method to cancel delayed `func` invocations and a `flush` method to
 * immediately invoke them. Provide an options object to indicate whether
 * `func` should be invoked on the leading and/or trailing edge of the `wait`
 * timeout. The `func` is invoked with the last arguments provided to the
 * throttled function. Subsequent calls to the throttled function return the
 * result of the last `func` invocation.
 *
 * **Note:** If `leading` and `trailing` options are `true`, `func` is invoked
 * on the trailing edge of the timeout only if the throttled function is
 * invoked more than once during the `wait` timeout.
 *
 * See [David Corbacho's article](http://drupalmotion.com/article/debounce-and-throttle-visual-explanation)
 * for details over the differences between `_.throttle` and `_.debounce`.
 *
 * @static
 * @memberOf _
 * @category Function
 * @param {Function} func The function to throttle.
 * @param {number} [wait=0] The number of milliseconds to throttle invocations to.
 * @param {Object} [options] The options object.
 * @param {boolean} [options.leading=true] Specify invoking on the leading
 *  edge of the timeout.
 * @param {boolean} [options.trailing=true] Specify invoking on the trailing
 *  edge of the timeout.
 * @returns {Function} Returns the new throttled function.
 * @example
 *
 * // Avoid excessively updating the position while scrolling.
 * jQuery(window).on('scroll', _.throttle(updatePosition, 100));
 *
 * // Invoke `renewToken` when the click event is fired, but not more than once every 5 minutes.
 * var throttled = _.throttle(renewToken, 300000, { 'trailing': false });
 * jQuery(element).on('click', throttled);
 *
 * // Cancel the trailing throttled invocation.
 * jQuery(window).on('popstate', throttled.cancel);
 */
function throttle(func, wait, options) {
  var leading = true,
      trailing = true;

  if (typeof func != 'function') {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  if (isObject(options)) {
    leading = 'leading' in options ? !!options.leading : leading;
    trailing = 'trailing' in options ? !!options.trailing : trailing;
  }
  return debounce(func, wait, {
    'leading': leading,
    'maxWait': wait,
    'trailing': trailing
  });
}

module.exports = throttle;

},{"./debounce":2,"./isObject":4}],7:[function(require,module,exports){
var isFunction = require('./isFunction'),
    isObject = require('./isObject');

/** Used as references for various `Number` constants. */
var NAN = 0 / 0;

/** Used to match leading and trailing whitespace. */
var reTrim = /^\s+|\s+$/g;

/** Used to detect bad signed hexadecimal string values. */
var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;

/** Used to detect binary string values. */
var reIsBinary = /^0b[01]+$/i;

/** Used to detect octal string values. */
var reIsOctal = /^0o[0-7]+$/i;

/** Built-in method references without a dependency on `root`. */
var freeParseInt = parseInt;

/**
 * Converts `value` to a number.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to process.
 * @returns {number} Returns the number.
 * @example
 *
 * _.toNumber(3);
 * // => 3
 *
 * _.toNumber(Number.MIN_VALUE);
 * // => 5e-324
 *
 * _.toNumber(Infinity);
 * // => Infinity
 *
 * _.toNumber('3');
 * // => 3
 */
function toNumber(value) {
  if (isObject(value)) {
    var other = isFunction(value.valueOf) ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  if (typeof value != 'string') {
    return value === 0 ? value : +value;
  }
  value = value.replace(reTrim, '');
  var isBinary = reIsBinary.test(value);
  return (isBinary || reIsOctal.test(value))
    ? freeParseInt(value.slice(2), isBinary ? 2 : 8)
    : (reIsBadHex.test(value) ? NAN : +value);
}

module.exports = toNumber;

},{"./isFunction":3,"./isObject":4}],8:[function(require,module,exports){
/**
 * Vue and every constructor that extends Vue has an
 * associated options object, which can be accessed during
 * compilation steps as `this.constructor.options`.
 *
 * These can be seen as the default options of every
 * Vue instance.
 */
(function(root, factory) {

    if (typeof module === "object" && module.exports) {
        module.exports = factory(require("interact.js"), require("lodash/throttle"), require("lodash/debounce"));
    } else {
        root.Sortable = factory(root.interact, root._.throttle, root._.debounce);
    }

})(this, function(interact, throttle, debounce){

    var Sortable = function(element, scrollable){
        this.scrollable = scrollable || null;
        this.element = element;
        this.items   = this.element.querySelectorAll(this.element.dataset.sortable);
        this.element.style.position = "relative";
        this.element.style.webkitTouchCallout = "none";
        this.element.style.webkitUserSelect = "none";
        this.bindEvents();
        this.setPositions();
    };

    /**
    * Bind Events
    */
    Sortable.prototype.bindEvents = function(){
        var self = this;
        window.addEventListener("resize", debounce(function(){
           self.setPositions();
        }, 200));
        interact(this.element.dataset.sortable, {
            context: this.element
        }).draggable({
            inertia: false,
            manualStart: ("ontouchstart" in window) || window.DocumentTouch && window.document instanceof window.DocumentTouch,
            autoScroll: {
                container: this.scrollable,
                margin: 50,
                speed: 600
            },
            onmove: throttle(function(e){
                self.move(e);
            }, 16, {trailing: false})
        })
        .off("dragstart")
        .off("dragend")
        .off("hold")
        .on("dragstart", function(e){
            var r = e.target.getBoundingClientRect();
            e.target.classList.add("is-dragged");
            e.target.style.transitionDuration = "0s";
            self.startPosition = e.target.dataset.position;
            self.offset = {
                x: e.clientX - r.left,
                y: e.clientY - r.top
            };
            self.scrollTopStart = self.getScrollTop();
        }).on("dragend", function(e){
            e.target.classList.remove("is-dragged");
            e.target.style.transitionDuration = null;
            self.moveItem(e.target, e.target.dataset.position);
            self.sendResults();
        }).on("hold", function(e){
            if(!e.interaction.interacting()){
                e.interaction.start({
                    name: "drag"
                }, e.interactable, e.currentTarget);
            }
        });
    };

    /**
    * Build the grid
    * - Items position is set to "absolute"
    * - Every items is positioned using transform
    * - Transition duration is set to 0 during this operation
    **/
    Sortable.prototype.setPositions = function(){
        var self = this;
        var rect = this.items[0].getBoundingClientRect();
        this.item_width = Math.floor(rect.width);
        this.item_height = Math.floor(rect.height);
        this.cols = Math.floor(this.element.offsetWidth / this.item_width);
        this.element.style.height = (this.item_height * Math.ceil(this.items.length / this.cols)) + "px";
        for(var i = 0, x = this.items.length; i < x; i++) {
            var item = this.items[i];
            item.style.position = "absolute";
            item.style.top = "0px";
            item.style.left = "0px";
            item.style.transitionDuration = "0s";
            this.moveItem(item, item.dataset.position);
        }
        window.setTimeout(function(){
             for(var i = 0, x = self.items.length; i < x; i++) {
                var item = self.items[i];
                item.style.transitionDuration = null;
             }
        }, 100);
    };

    /**
    * Move an element to follow mouse cursor
    * @param e interact.js event
    */
    Sortable.prototype.move = function(e){
        var p = this.getXY(this.startPosition);
        var x = p.x + e.clientX - e.clientX0;
        var y = p.y + e.clientY - e.clientY0 + this.getScrollTop() - this.scrollTopStart;
        e.target.style.transform = "translate3D(" + x + "px, " + y + "px, 0)";
        var oldPosition = parseInt(e.target.dataset.position, 10);
        var newPosition = this.guessPosition(x + this.offset.x, y + this.offset.y);
        if(oldPosition !== newPosition){
            this.swap(oldPosition, newPosition);
            e.target.dataset.position = newPosition;
        }
        this.guessPosition(x, y);
    };

    /*
    * Get position of an element relative to the parent
    * x:0, y:0 being the top left corner of the container
    */
    Sortable.prototype.getXY = function(position){
        var x = this.item_width * (position % this.cols);
        var y = this.item_height * Math.floor(position / this.cols);
        return {
            x: x,
            y: y
        };
    };

    /**
    * Guess the position number from x, y
    * @param x
    * @param y
    * @returns {number}
    */
    Sortable.prototype.guessPosition = function(x, y){
        var col = Math.floor(x / this.item_width);
        if(col >= this.cols){
            col = this.cols - 1;
        }
        if(col <= 0){
            col = 0;
        }
        var row = Math.floor(y / this.item_height);
        if(row < 0){
            row = 0;
        }
        var position = col + row * this.cols;
        if(position >= this.items.length){
            return this.items.length - 1;
        }
        return position;
    };

    /**
    * Guess the position from x, y
    * @param start
    * @param end
    */
    Sortable.prototype.swap = function(start, end){
        for(var i = 0, x = this.items.length; i < x; i++) {
            var item = this.items[i];
            if(!item.classList.contains("is-dragged")){
                var position = parseInt(item.dataset.position, 10);
                if(position >= end && position < start && end < start){
                    this.moveItem(item, position + 1);
                } else if(position <= end && position > start && end > start){
                    this.moveItem(item, position - 1);
                }
            }
        }
    };

    /**
    * Move an item to his new position
    * @param item
    * @param position
    */
    Sortable.prototype.moveItem = function(item, position){
        var p = this.getXY(position);
        item.style.transform = "translate3D(" + p.x + "px, " + p.y + "px, 0)";
        item.dataset.position = position;
    };

    /**
    * Send results
    * @param item
    * @param position
    */
    Sortable.prototype.sendResults = function(){
        var results = {};
        for(var i = 0, x = this.items.length; i < x; i++) {
            var item = this.items[i];
            results[item.dataset.id] = item.dataset.position;
        }
        this.success(results);
    };

    /**
     * Get container scrollTop
     * (fix bug in chrome, body.scrollTop is deprecated)
     */
    Sortable.prototype.getScrollTop = function() {
        return this.scrollable ? this.scrollable.scrollTop : (window.document.documentElement.scrollTop || window.document.body.scrollTop);
    }

    return Sortable;
});
},{"interact.js":1,"lodash/debounce":2,"lodash/throttle":6}],9:[function(require,module,exports){
// Used for gulp task (useless otherwise)
window.Sortable = require('./Sortable');
},{"./Sortable":8}]},{},[9])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvaW50ZXJhY3QuanMvaW50ZXJhY3QuanMiLCJub2RlX21vZHVsZXMvbG9kYXNoL2RlYm91bmNlLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC9pc0Z1bmN0aW9uLmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC9pc09iamVjdC5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gvbm93LmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC90aHJvdHRsZS5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gvdG9OdW1iZXIuanMiLCJzcmMvU29ydGFibGUuanMiLCJzcmMvYnJvd3NlcmlmeS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3gxTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakxBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hOQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qKlxuICogaW50ZXJhY3QuanMgdjEuMi42XG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDEyLTIwMTUgVGF5ZSBBZGV5ZW1pIDxkZXZAdGF5ZS5tZT5cbiAqIE9wZW4gc291cmNlIHVuZGVyIHRoZSBNSVQgTGljZW5zZS5cbiAqIGh0dHBzOi8vcmF3LmdpdGh1Yi5jb20vdGF5ZS9pbnRlcmFjdC5qcy9tYXN0ZXIvTElDRU5TRVxuICovXG4oZnVuY3Rpb24gKHJlYWxXaW5kb3cpIHtcbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICAvLyByZXR1cm4gZWFybHkgaWYgdGhlcmUncyBubyB3aW5kb3cgdG8gd29yayB3aXRoIChlZy4gTm9kZS5qcylcbiAgICBpZiAoIXJlYWxXaW5kb3cpIHsgcmV0dXJuOyB9XG5cbiAgICB2YXIgLy8gZ2V0IHdyYXBwZWQgd2luZG93IGlmIHVzaW5nIFNoYWRvdyBET00gcG9seWZpbGxcbiAgICAgICAgd2luZG93ID0gKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIC8vIGNyZWF0ZSBhIFRleHROb2RlXG4gICAgICAgICAgICB2YXIgZWwgPSByZWFsV2luZG93LmRvY3VtZW50LmNyZWF0ZVRleHROb2RlKCcnKTtcblxuICAgICAgICAgICAgLy8gY2hlY2sgaWYgaXQncyB3cmFwcGVkIGJ5IGEgcG9seWZpbGxcbiAgICAgICAgICAgIGlmIChlbC5vd25lckRvY3VtZW50ICE9PSByZWFsV2luZG93LmRvY3VtZW50XG4gICAgICAgICAgICAgICAgJiYgdHlwZW9mIHJlYWxXaW5kb3cud3JhcCA9PT0gJ2Z1bmN0aW9uJ1xuICAgICAgICAgICAgICAgICYmIHJlYWxXaW5kb3cud3JhcChlbCkgPT09IGVsKSB7XG4gICAgICAgICAgICAgICAgLy8gcmV0dXJuIHdyYXBwZWQgd2luZG93XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlYWxXaW5kb3cud3JhcChyZWFsV2luZG93KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gbm8gU2hhZG93IERPTSBwb2x5ZmlsIG9yIG5hdGl2ZSBpbXBsZW1lbnRhdGlvblxuICAgICAgICAgICAgcmV0dXJuIHJlYWxXaW5kb3c7XG4gICAgICAgIH0oKSksXG5cbiAgICAgICAgZG9jdW1lbnQgICAgICAgICAgID0gd2luZG93LmRvY3VtZW50LFxuICAgICAgICBEb2N1bWVudEZyYWdtZW50ICAgPSB3aW5kb3cuRG9jdW1lbnRGcmFnbWVudCAgIHx8IGJsYW5rLFxuICAgICAgICBTVkdFbGVtZW50ICAgICAgICAgPSB3aW5kb3cuU1ZHRWxlbWVudCAgICAgICAgIHx8IGJsYW5rLFxuICAgICAgICBTVkdTVkdFbGVtZW50ICAgICAgPSB3aW5kb3cuU1ZHU1ZHRWxlbWVudCAgICAgIHx8IGJsYW5rLFxuICAgICAgICBTVkdFbGVtZW50SW5zdGFuY2UgPSB3aW5kb3cuU1ZHRWxlbWVudEluc3RhbmNlIHx8IGJsYW5rLFxuICAgICAgICBIVE1MRWxlbWVudCAgICAgICAgPSB3aW5kb3cuSFRNTEVsZW1lbnQgICAgICAgIHx8IHdpbmRvdy5FbGVtZW50LFxuXG4gICAgICAgIFBvaW50ZXJFdmVudCA9ICh3aW5kb3cuUG9pbnRlckV2ZW50IHx8IHdpbmRvdy5NU1BvaW50ZXJFdmVudCksXG4gICAgICAgIHBFdmVudFR5cGVzLFxuXG4gICAgICAgIGh5cG90ID0gTWF0aC5oeXBvdCB8fCBmdW5jdGlvbiAoeCwgeSkgeyByZXR1cm4gTWF0aC5zcXJ0KHggKiB4ICsgeSAqIHkpOyB9LFxuXG4gICAgICAgIHRtcFhZID0ge30sICAgICAvLyByZWR1Y2Ugb2JqZWN0IGNyZWF0aW9uIGluIGdldFhZKClcblxuICAgICAgICBkb2N1bWVudHMgICAgICAgPSBbXSwgICAvLyBhbGwgZG9jdW1lbnRzIGJlaW5nIGxpc3RlbmVkIHRvXG5cbiAgICAgICAgaW50ZXJhY3RhYmxlcyAgID0gW10sICAgLy8gYWxsIHNldCBpbnRlcmFjdGFibGVzXG4gICAgICAgIGludGVyYWN0aW9ucyAgICA9IFtdLCAgIC8vIGFsbCBpbnRlcmFjdGlvbnNcblxuICAgICAgICBkeW5hbWljRHJvcCAgICAgPSBmYWxzZSxcblxuICAgICAgICAvLyB7XG4gICAgICAgIC8vICAgICAgdHlwZToge1xuICAgICAgICAvLyAgICAgICAgICBzZWxlY3RvcnM6IFsnc2VsZWN0b3InLCAuLi5dLFxuICAgICAgICAvLyAgICAgICAgICBjb250ZXh0cyA6IFtkb2N1bWVudCwgLi4uXSxcbiAgICAgICAgLy8gICAgICAgICAgbGlzdGVuZXJzOiBbW2xpc3RlbmVyLCB1c2VDYXB0dXJlXSwgLi4uXVxuICAgICAgICAvLyAgICAgIH1cbiAgICAgICAgLy8gIH1cbiAgICAgICAgZGVsZWdhdGVkRXZlbnRzID0ge30sXG5cbiAgICAgICAgZGVmYXVsdE9wdGlvbnMgPSB7XG4gICAgICAgICAgICBiYXNlOiB7XG4gICAgICAgICAgICAgICAgYWNjZXB0ICAgICAgICA6IG51bGwsXG4gICAgICAgICAgICAgICAgYWN0aW9uQ2hlY2tlciA6IG51bGwsXG4gICAgICAgICAgICAgICAgc3R5bGVDdXJzb3IgICA6IHRydWUsXG4gICAgICAgICAgICAgICAgcHJldmVudERlZmF1bHQ6ICdhdXRvJyxcbiAgICAgICAgICAgICAgICBvcmlnaW4gICAgICAgIDogeyB4OiAwLCB5OiAwIH0sXG4gICAgICAgICAgICAgICAgZGVsdGFTb3VyY2UgICA6ICdwYWdlJyxcbiAgICAgICAgICAgICAgICBhbGxvd0Zyb20gICAgIDogbnVsbCxcbiAgICAgICAgICAgICAgICBpZ25vcmVGcm9tICAgIDogbnVsbCxcbiAgICAgICAgICAgICAgICBfY29udGV4dCAgICAgIDogZG9jdW1lbnQsXG4gICAgICAgICAgICAgICAgZHJvcENoZWNrZXIgICA6IG51bGxcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIGRyYWc6IHtcbiAgICAgICAgICAgICAgICBlbmFibGVkOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBtYW51YWxTdGFydDogdHJ1ZSxcbiAgICAgICAgICAgICAgICBtYXg6IEluZmluaXR5LFxuICAgICAgICAgICAgICAgIG1heFBlckVsZW1lbnQ6IDEsXG5cbiAgICAgICAgICAgICAgICBzbmFwOiBudWxsLFxuICAgICAgICAgICAgICAgIHJlc3RyaWN0OiBudWxsLFxuICAgICAgICAgICAgICAgIGluZXJ0aWE6IG51bGwsXG4gICAgICAgICAgICAgICAgYXV0b1Njcm9sbDogbnVsbCxcblxuICAgICAgICAgICAgICAgIGF4aXM6ICd4eSdcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIGRyb3A6IHtcbiAgICAgICAgICAgICAgICBlbmFibGVkOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBhY2NlcHQ6IG51bGwsXG4gICAgICAgICAgICAgICAgb3ZlcmxhcDogJ3BvaW50ZXInXG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICByZXNpemU6IHtcbiAgICAgICAgICAgICAgICBlbmFibGVkOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBtYW51YWxTdGFydDogZmFsc2UsXG4gICAgICAgICAgICAgICAgbWF4OiBJbmZpbml0eSxcbiAgICAgICAgICAgICAgICBtYXhQZXJFbGVtZW50OiAxLFxuXG4gICAgICAgICAgICAgICAgc25hcDogbnVsbCxcbiAgICAgICAgICAgICAgICByZXN0cmljdDogbnVsbCxcbiAgICAgICAgICAgICAgICBpbmVydGlhOiBudWxsLFxuICAgICAgICAgICAgICAgIGF1dG9TY3JvbGw6IG51bGwsXG5cbiAgICAgICAgICAgICAgICBzcXVhcmU6IGZhbHNlLFxuICAgICAgICAgICAgICAgIHByZXNlcnZlQXNwZWN0UmF0aW86IGZhbHNlLFxuICAgICAgICAgICAgICAgIGF4aXM6ICd4eScsXG5cbiAgICAgICAgICAgICAgICAvLyB1c2UgZGVmYXVsdCBtYXJnaW5cbiAgICAgICAgICAgICAgICBtYXJnaW46IE5hTixcblxuICAgICAgICAgICAgICAgIC8vIG9iamVjdCB3aXRoIHByb3BzIGxlZnQsIHJpZ2h0LCB0b3AsIGJvdHRvbSB3aGljaCBhcmVcbiAgICAgICAgICAgICAgICAvLyB0cnVlL2ZhbHNlIHZhbHVlcyB0byByZXNpemUgd2hlbiB0aGUgcG9pbnRlciBpcyBvdmVyIHRoYXQgZWRnZSxcbiAgICAgICAgICAgICAgICAvLyBDU1Mgc2VsZWN0b3JzIHRvIG1hdGNoIHRoZSBoYW5kbGVzIGZvciBlYWNoIGRpcmVjdGlvblxuICAgICAgICAgICAgICAgIC8vIG9yIHRoZSBFbGVtZW50cyBmb3IgZWFjaCBoYW5kbGVcbiAgICAgICAgICAgICAgICBlZGdlczogbnVsbCxcblxuICAgICAgICAgICAgICAgIC8vIGEgdmFsdWUgb2YgJ25vbmUnIHdpbGwgbGltaXQgdGhlIHJlc2l6ZSByZWN0IHRvIGEgbWluaW11bSBvZiAweDBcbiAgICAgICAgICAgICAgICAvLyAnbmVnYXRlJyB3aWxsIGFsb3cgdGhlIHJlY3QgdG8gaGF2ZSBuZWdhdGl2ZSB3aWR0aC9oZWlnaHRcbiAgICAgICAgICAgICAgICAvLyAncmVwb3NpdGlvbicgd2lsbCBrZWVwIHRoZSB3aWR0aC9oZWlnaHQgcG9zaXRpdmUgYnkgc3dhcHBpbmdcbiAgICAgICAgICAgICAgICAvLyB0aGUgdG9wIGFuZCBib3R0b20gZWRnZXMgYW5kL29yIHN3YXBwaW5nIHRoZSBsZWZ0IGFuZCByaWdodCBlZGdlc1xuICAgICAgICAgICAgICAgIGludmVydDogJ25vbmUnXG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBnZXN0dXJlOiB7XG4gICAgICAgICAgICAgICAgbWFudWFsU3RhcnQ6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGVuYWJsZWQ6IGZhbHNlLFxuICAgICAgICAgICAgICAgIG1heDogSW5maW5pdHksXG4gICAgICAgICAgICAgICAgbWF4UGVyRWxlbWVudDogMSxcblxuICAgICAgICAgICAgICAgIHJlc3RyaWN0OiBudWxsXG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBwZXJBY3Rpb246IHtcbiAgICAgICAgICAgICAgICBtYW51YWxTdGFydDogZmFsc2UsXG4gICAgICAgICAgICAgICAgbWF4OiBJbmZpbml0eSxcbiAgICAgICAgICAgICAgICBtYXhQZXJFbGVtZW50OiAxLFxuXG4gICAgICAgICAgICAgICAgc25hcDoge1xuICAgICAgICAgICAgICAgICAgICBlbmFibGVkICAgICA6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBlbmRPbmx5ICAgICA6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICByYW5nZSAgICAgICA6IEluZmluaXR5LFxuICAgICAgICAgICAgICAgICAgICB0YXJnZXRzICAgICA6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIG9mZnNldHMgICAgIDogbnVsbCxcblxuICAgICAgICAgICAgICAgICAgICByZWxhdGl2ZVBvaW50czogbnVsbFxuICAgICAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgICAgICByZXN0cmljdDoge1xuICAgICAgICAgICAgICAgICAgICBlbmFibGVkOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZW5kT25seTogZmFsc2VcbiAgICAgICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICAgICAgYXV0b1Njcm9sbDoge1xuICAgICAgICAgICAgICAgICAgICBlbmFibGVkICAgICA6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBjb250YWluZXIgICA6IG51bGwsICAgICAvLyB0aGUgaXRlbSB0aGF0IGlzIHNjcm9sbGVkIChXaW5kb3cgb3IgSFRNTEVsZW1lbnQpXG4gICAgICAgICAgICAgICAgICAgIG1hcmdpbiAgICAgIDogNjAsXG4gICAgICAgICAgICAgICAgICAgIHNwZWVkICAgICAgIDogMzAwICAgICAgIC8vIHRoZSBzY3JvbGwgc3BlZWQgaW4gcGl4ZWxzIHBlciBzZWNvbmRcbiAgICAgICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICAgICAgaW5lcnRpYToge1xuICAgICAgICAgICAgICAgICAgICBlbmFibGVkICAgICAgICAgIDogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIHJlc2lzdGFuY2UgICAgICAgOiAxMCwgICAgLy8gdGhlIGxhbWJkYSBpbiBleHBvbmVudGlhbCBkZWNheVxuICAgICAgICAgICAgICAgICAgICBtaW5TcGVlZCAgICAgICAgIDogMTAwLCAgIC8vIHRhcmdldCBzcGVlZCBtdXN0IGJlIGFib3ZlIHRoaXMgZm9yIGluZXJ0aWEgdG8gc3RhcnRcbiAgICAgICAgICAgICAgICAgICAgZW5kU3BlZWQgICAgICAgICA6IDEwLCAgICAvLyB0aGUgc3BlZWQgYXQgd2hpY2ggaW5lcnRpYSBpcyBzbG93IGVub3VnaCB0byBzdG9wXG4gICAgICAgICAgICAgICAgICAgIGFsbG93UmVzdW1lICAgICAgOiB0cnVlLCAgLy8gYWxsb3cgcmVzdW1pbmcgYW4gYWN0aW9uIGluIGluZXJ0aWEgcGhhc2VcbiAgICAgICAgICAgICAgICAgICAgemVyb1Jlc3VtZURlbHRhICA6IHRydWUsICAvLyBpZiBhbiBhY3Rpb24gaXMgcmVzdW1lZCBhZnRlciBsYXVuY2gsIHNldCBkeC9keSB0byAwXG4gICAgICAgICAgICAgICAgICAgIHNtb290aEVuZER1cmF0aW9uOiAzMDAgICAgLy8gYW5pbWF0ZSB0byBzbmFwL3Jlc3RyaWN0IGVuZE9ubHkgaWYgdGhlcmUncyBubyBpbmVydGlhXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgX2hvbGREdXJhdGlvbjogNjAwXG4gICAgICAgIH0sXG5cbiAgICAgICAgLy8gVGhpbmdzIHJlbGF0ZWQgdG8gYXV0b1Njcm9sbFxuICAgICAgICBhdXRvU2Nyb2xsID0ge1xuICAgICAgICAgICAgaW50ZXJhY3Rpb246IG51bGwsXG4gICAgICAgICAgICBpOiBudWxsLCAgICAvLyB0aGUgaGFuZGxlIHJldHVybmVkIGJ5IHdpbmRvdy5zZXRJbnRlcnZhbFxuICAgICAgICAgICAgeDogMCwgeTogMCwgLy8gRGlyZWN0aW9uIGVhY2ggcHVsc2UgaXMgdG8gc2Nyb2xsIGluXG5cbiAgICAgICAgICAgIC8vIHNjcm9sbCB0aGUgd2luZG93IGJ5IHRoZSB2YWx1ZXMgaW4gc2Nyb2xsLngveVxuICAgICAgICAgICAgc2Nyb2xsOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgdmFyIG9wdGlvbnMgPSBhdXRvU2Nyb2xsLmludGVyYWN0aW9uLnRhcmdldC5vcHRpb25zW2F1dG9TY3JvbGwuaW50ZXJhY3Rpb24ucHJlcGFyZWQubmFtZV0uYXV0b1Njcm9sbCxcbiAgICAgICAgICAgICAgICAgICAgY29udGFpbmVyID0gb3B0aW9ucy5jb250YWluZXIgfHwgZ2V0V2luZG93KGF1dG9TY3JvbGwuaW50ZXJhY3Rpb24uZWxlbWVudCksXG4gICAgICAgICAgICAgICAgICAgIG5vdyA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpLFxuICAgICAgICAgICAgICAgICAgICAvLyBjaGFuZ2UgaW4gdGltZSBpbiBzZWNvbmRzXG4gICAgICAgICAgICAgICAgICAgIGR0eCA9IChub3cgLSBhdXRvU2Nyb2xsLnByZXZUaW1lWCkgLyAxMDAwLFxuICAgICAgICAgICAgICAgICAgICBkdHkgPSAobm93IC0gYXV0b1Njcm9sbC5wcmV2VGltZVkpIC8gMTAwMCxcbiAgICAgICAgICAgICAgICAgICAgdngsIHZ5LCBzeCwgc3k7XG5cbiAgICAgICAgICAgICAgICAvLyBkaXNwbGFjZW1lbnRcbiAgICAgICAgICAgICAgICBpZiAob3B0aW9ucy52ZWxvY2l0eSkge1xuICAgICAgICAgICAgICAgICAgdnggPSBvcHRpb25zLnZlbG9jaXR5Lng7XG4gICAgICAgICAgICAgICAgICB2eSA9IG9wdGlvbnMudmVsb2NpdHkueTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICB2eCA9IHZ5ID0gb3B0aW9ucy5zcGVlZFxuICAgICAgICAgICAgICAgIH1cbiBcbiAgICAgICAgICAgICAgICBzeCA9IHZ4ICogZHR4O1xuICAgICAgICAgICAgICAgIHN5ID0gdnkgKiBkdHk7XG5cbiAgICAgICAgICAgICAgICBpZiAoc3ggPj0gMSB8fCBzeSA+PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpc1dpbmRvdyhjb250YWluZXIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250YWluZXIuc2Nyb2xsQnkoYXV0b1Njcm9sbC54ICogc3gsIGF1dG9TY3JvbGwueSAqIHN5KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIGlmIChjb250YWluZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRhaW5lci5zY3JvbGxMZWZ0ICs9IGF1dG9TY3JvbGwueCAqIHN4O1xuICAgICAgICAgICAgICAgICAgICAgICAgY29udGFpbmVyLnNjcm9sbFRvcCAgKz0gYXV0b1Njcm9sbC55ICogc3k7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAoc3ggPj0xKSBhdXRvU2Nyb2xsLnByZXZUaW1lWCA9IG5vdztcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN5ID49IDEpIGF1dG9TY3JvbGwucHJldlRpbWVZID0gbm93O1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChhdXRvU2Nyb2xsLmlzU2Nyb2xsaW5nKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhbmNlbEZyYW1lKGF1dG9TY3JvbGwuaSk7XG4gICAgICAgICAgICAgICAgICAgIGF1dG9TY3JvbGwuaSA9IHJlcUZyYW1lKGF1dG9TY3JvbGwuc2Nyb2xsKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBpc1Njcm9sbGluZzogZmFsc2UsXG4gICAgICAgICAgICBwcmV2VGltZVg6IDAsXG4gICAgICAgICAgICBwcmV2VGltZVk6IDAsXG5cbiAgICAgICAgICAgIHN0YXJ0OiBmdW5jdGlvbiAoaW50ZXJhY3Rpb24pIHtcbiAgICAgICAgICAgICAgICBhdXRvU2Nyb2xsLmlzU2Nyb2xsaW5nID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBjYW5jZWxGcmFtZShhdXRvU2Nyb2xsLmkpO1xuXG4gICAgICAgICAgICAgICAgYXV0b1Njcm9sbC5pbnRlcmFjdGlvbiA9IGludGVyYWN0aW9uO1xuICAgICAgICAgICAgICAgIGF1dG9TY3JvbGwucHJldlRpbWVYID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gICAgICAgICAgICAgICAgYXV0b1Njcm9sbC5wcmV2VGltZVkgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICAgICAgICAgICAgICBhdXRvU2Nyb2xsLmkgPSByZXFGcmFtZShhdXRvU2Nyb2xsLnNjcm9sbCk7XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBzdG9wOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgYXV0b1Njcm9sbC5pc1Njcm9sbGluZyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGNhbmNlbEZyYW1lKGF1dG9TY3JvbGwuaSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgLy8gRG9lcyB0aGUgYnJvd3NlciBzdXBwb3J0IHRvdWNoIGlucHV0P1xuICAgICAgICBzdXBwb3J0c1RvdWNoID0gKCgnb250b3VjaHN0YXJ0JyBpbiB3aW5kb3cpIHx8IHdpbmRvdy5Eb2N1bWVudFRvdWNoICYmIGRvY3VtZW50IGluc3RhbmNlb2Ygd2luZG93LkRvY3VtZW50VG91Y2gpLFxuXG4gICAgICAgIC8vIERvZXMgdGhlIGJyb3dzZXIgc3VwcG9ydCBQb2ludGVyRXZlbnRzXG4gICAgICAgIHN1cHBvcnRzUG9pbnRlckV2ZW50ID0gISFQb2ludGVyRXZlbnQsXG5cbiAgICAgICAgLy8gTGVzcyBQcmVjaXNpb24gd2l0aCB0b3VjaCBpbnB1dFxuICAgICAgICBtYXJnaW4gPSBzdXBwb3J0c1RvdWNoIHx8IHN1cHBvcnRzUG9pbnRlckV2ZW50PyAyMDogMTAsXG5cbiAgICAgICAgcG9pbnRlck1vdmVUb2xlcmFuY2UgPSAxLFxuXG4gICAgICAgIC8vIGZvciBpZ25vcmluZyBicm93c2VyJ3Mgc2ltdWxhdGVkIG1vdXNlIGV2ZW50c1xuICAgICAgICBwcmV2VG91Y2hUaW1lID0gMCxcblxuICAgICAgICAvLyBBbGxvdyB0aGlzIG1hbnkgaW50ZXJhY3Rpb25zIHRvIGhhcHBlbiBzaW11bHRhbmVvdXNseVxuICAgICAgICBtYXhJbnRlcmFjdGlvbnMgPSBJbmZpbml0eSxcblxuICAgICAgICAvLyBDaGVjayBpZiBpcyBJRTkgb3Igb2xkZXJcbiAgICAgICAgYWN0aW9uQ3Vyc29ycyA9IChkb2N1bWVudC5hbGwgJiYgIXdpbmRvdy5hdG9iKSA/IHtcbiAgICAgICAgICAgIGRyYWcgICAgOiAnbW92ZScsXG4gICAgICAgICAgICByZXNpemV4IDogJ2UtcmVzaXplJyxcbiAgICAgICAgICAgIHJlc2l6ZXkgOiAncy1yZXNpemUnLFxuICAgICAgICAgICAgcmVzaXpleHk6ICdzZS1yZXNpemUnLFxuXG4gICAgICAgICAgICByZXNpemV0b3AgICAgICAgIDogJ24tcmVzaXplJyxcbiAgICAgICAgICAgIHJlc2l6ZWxlZnQgICAgICAgOiAndy1yZXNpemUnLFxuICAgICAgICAgICAgcmVzaXplYm90dG9tICAgICA6ICdzLXJlc2l6ZScsXG4gICAgICAgICAgICByZXNpemVyaWdodCAgICAgIDogJ2UtcmVzaXplJyxcbiAgICAgICAgICAgIHJlc2l6ZXRvcGxlZnQgICAgOiAnc2UtcmVzaXplJyxcbiAgICAgICAgICAgIHJlc2l6ZWJvdHRvbXJpZ2h0OiAnc2UtcmVzaXplJyxcbiAgICAgICAgICAgIHJlc2l6ZXRvcHJpZ2h0ICAgOiAnbmUtcmVzaXplJyxcbiAgICAgICAgICAgIHJlc2l6ZWJvdHRvbWxlZnQgOiAnbmUtcmVzaXplJyxcblxuICAgICAgICAgICAgZ2VzdHVyZSA6ICcnXG4gICAgICAgIH0gOiB7XG4gICAgICAgICAgICBkcmFnICAgIDogJ21vdmUnLFxuICAgICAgICAgICAgcmVzaXpleCA6ICdldy1yZXNpemUnLFxuICAgICAgICAgICAgcmVzaXpleSA6ICducy1yZXNpemUnLFxuICAgICAgICAgICAgcmVzaXpleHk6ICdud3NlLXJlc2l6ZScsXG5cbiAgICAgICAgICAgIHJlc2l6ZXRvcCAgICAgICAgOiAnbnMtcmVzaXplJyxcbiAgICAgICAgICAgIHJlc2l6ZWxlZnQgICAgICAgOiAnZXctcmVzaXplJyxcbiAgICAgICAgICAgIHJlc2l6ZWJvdHRvbSAgICAgOiAnbnMtcmVzaXplJyxcbiAgICAgICAgICAgIHJlc2l6ZXJpZ2h0ICAgICAgOiAnZXctcmVzaXplJyxcbiAgICAgICAgICAgIHJlc2l6ZXRvcGxlZnQgICAgOiAnbndzZS1yZXNpemUnLFxuICAgICAgICAgICAgcmVzaXplYm90dG9tcmlnaHQ6ICdud3NlLXJlc2l6ZScsXG4gICAgICAgICAgICByZXNpemV0b3ByaWdodCAgIDogJ25lc3ctcmVzaXplJyxcbiAgICAgICAgICAgIHJlc2l6ZWJvdHRvbWxlZnQgOiAnbmVzdy1yZXNpemUnLFxuXG4gICAgICAgICAgICBnZXN0dXJlIDogJydcbiAgICAgICAgfSxcblxuICAgICAgICBhY3Rpb25Jc0VuYWJsZWQgPSB7XG4gICAgICAgICAgICBkcmFnICAgOiB0cnVlLFxuICAgICAgICAgICAgcmVzaXplIDogdHJ1ZSxcbiAgICAgICAgICAgIGdlc3R1cmU6IHRydWVcbiAgICAgICAgfSxcblxuICAgICAgICAvLyBiZWNhdXNlIFdlYmtpdCBhbmQgT3BlcmEgc3RpbGwgdXNlICdtb3VzZXdoZWVsJyBldmVudCB0eXBlXG4gICAgICAgIHdoZWVsRXZlbnQgPSAnb25tb3VzZXdoZWVsJyBpbiBkb2N1bWVudD8gJ21vdXNld2hlZWwnOiAnd2hlZWwnLFxuXG4gICAgICAgIGV2ZW50VHlwZXMgPSBbXG4gICAgICAgICAgICAnZHJhZ3N0YXJ0JyxcbiAgICAgICAgICAgICdkcmFnbW92ZScsXG4gICAgICAgICAgICAnZHJhZ2luZXJ0aWFzdGFydCcsXG4gICAgICAgICAgICAnZHJhZ2VuZCcsXG4gICAgICAgICAgICAnZHJhZ2VudGVyJyxcbiAgICAgICAgICAgICdkcmFnbGVhdmUnLFxuICAgICAgICAgICAgJ2Ryb3BhY3RpdmF0ZScsXG4gICAgICAgICAgICAnZHJvcGRlYWN0aXZhdGUnLFxuICAgICAgICAgICAgJ2Ryb3Btb3ZlJyxcbiAgICAgICAgICAgICdkcm9wJyxcbiAgICAgICAgICAgICdyZXNpemVzdGFydCcsXG4gICAgICAgICAgICAncmVzaXplbW92ZScsXG4gICAgICAgICAgICAncmVzaXplaW5lcnRpYXN0YXJ0JyxcbiAgICAgICAgICAgICdyZXNpemVlbmQnLFxuICAgICAgICAgICAgJ2dlc3R1cmVzdGFydCcsXG4gICAgICAgICAgICAnZ2VzdHVyZW1vdmUnLFxuICAgICAgICAgICAgJ2dlc3R1cmVpbmVydGlhc3RhcnQnLFxuICAgICAgICAgICAgJ2dlc3R1cmVlbmQnLFxuXG4gICAgICAgICAgICAnZG93bicsXG4gICAgICAgICAgICAnbW92ZScsXG4gICAgICAgICAgICAndXAnLFxuICAgICAgICAgICAgJ2NhbmNlbCcsXG4gICAgICAgICAgICAndGFwJyxcbiAgICAgICAgICAgICdkb3VibGV0YXAnLFxuICAgICAgICAgICAgJ2hvbGQnXG4gICAgICAgIF0sXG5cbiAgICAgICAgZ2xvYmFsRXZlbnRzID0ge30sXG5cbiAgICAgICAgLy8gT3BlcmEgTW9iaWxlIG11c3QgYmUgaGFuZGxlZCBkaWZmZXJlbnRseVxuICAgICAgICBpc09wZXJhTW9iaWxlID0gbmF2aWdhdG9yLmFwcE5hbWUgPT0gJ09wZXJhJyAmJlxuICAgICAgICAgICAgc3VwcG9ydHNUb3VjaCAmJlxuICAgICAgICAgICAgbmF2aWdhdG9yLnVzZXJBZ2VudC5tYXRjaCgnUHJlc3RvJyksXG5cbiAgICAgICAgLy8gc2Nyb2xsaW5nIGRvZXNuJ3QgY2hhbmdlIHRoZSByZXN1bHQgb2YgZ2V0Q2xpZW50UmVjdHMgb24gaU9TIDdcbiAgICAgICAgaXNJT1M3ID0gKC9pUChob25lfG9kfGFkKS8udGVzdChuYXZpZ2F0b3IucGxhdGZvcm0pXG4gICAgICAgICAgICAgICAgICAgICAgICAgJiYgL09TIDdbXlxcZF0vLnRlc3QobmF2aWdhdG9yLmFwcFZlcnNpb24pKSxcblxuICAgICAgICAvLyBwcmVmaXggbWF0Y2hlc1NlbGVjdG9yXG4gICAgICAgIHByZWZpeGVkTWF0Y2hlc1NlbGVjdG9yID0gJ21hdGNoZXMnIGluIEVsZW1lbnQucHJvdG90eXBlP1xuICAgICAgICAgICAgICAgICdtYXRjaGVzJzogJ3dlYmtpdE1hdGNoZXNTZWxlY3RvcicgaW4gRWxlbWVudC5wcm90b3R5cGU/XG4gICAgICAgICAgICAgICAgICAgICd3ZWJraXRNYXRjaGVzU2VsZWN0b3InOiAnbW96TWF0Y2hlc1NlbGVjdG9yJyBpbiBFbGVtZW50LnByb3RvdHlwZT9cbiAgICAgICAgICAgICAgICAgICAgICAgICdtb3pNYXRjaGVzU2VsZWN0b3InOiAnb01hdGNoZXNTZWxlY3RvcicgaW4gRWxlbWVudC5wcm90b3R5cGU/XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJ29NYXRjaGVzU2VsZWN0b3InOiAnbXNNYXRjaGVzU2VsZWN0b3InLFxuXG4gICAgICAgIC8vIHdpbGwgYmUgcG9seWZpbGwgZnVuY3Rpb24gaWYgYnJvd3NlciBpcyBJRThcbiAgICAgICAgaWU4TWF0Y2hlc1NlbGVjdG9yLFxuXG4gICAgICAgIC8vIG5hdGl2ZSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgb3IgcG9seWZpbGxcbiAgICAgICAgcmVxRnJhbWUgPSByZWFsV2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSxcbiAgICAgICAgY2FuY2VsRnJhbWUgPSByZWFsV2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lLFxuXG4gICAgICAgIC8vIEV2ZW50cyB3cmFwcGVyXG4gICAgICAgIGV2ZW50cyA9IChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgdXNlQXR0YWNoRXZlbnQgPSAoJ2F0dGFjaEV2ZW50JyBpbiB3aW5kb3cpICYmICEoJ2FkZEV2ZW50TGlzdGVuZXInIGluIHdpbmRvdyksXG4gICAgICAgICAgICAgICAgYWRkRXZlbnQgICAgICAgPSB1c2VBdHRhY2hFdmVudD8gICdhdHRhY2hFdmVudCc6ICdhZGRFdmVudExpc3RlbmVyJyxcbiAgICAgICAgICAgICAgICByZW1vdmVFdmVudCAgICA9IHVzZUF0dGFjaEV2ZW50PyAgJ2RldGFjaEV2ZW50JzogJ3JlbW92ZUV2ZW50TGlzdGVuZXInLFxuICAgICAgICAgICAgICAgIG9uICAgICAgICAgICAgID0gdXNlQXR0YWNoRXZlbnQ/ICdvbic6ICcnLFxuXG4gICAgICAgICAgICAgICAgZWxlbWVudHMgICAgICAgICAgPSBbXSxcbiAgICAgICAgICAgICAgICB0YXJnZXRzICAgICAgICAgICA9IFtdLFxuICAgICAgICAgICAgICAgIGF0dGFjaGVkTGlzdGVuZXJzID0gW107XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGFkZCAoZWxlbWVudCwgdHlwZSwgbGlzdGVuZXIsIHVzZUNhcHR1cmUpIHtcbiAgICAgICAgICAgICAgICB2YXIgZWxlbWVudEluZGV4ID0gaW5kZXhPZihlbGVtZW50cywgZWxlbWVudCksXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldCA9IHRhcmdldHNbZWxlbWVudEluZGV4XTtcblxuICAgICAgICAgICAgICAgIGlmICghdGFyZ2V0KSB7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldCA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50czoge30sXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlQ291bnQ6IDBcbiAgICAgICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50SW5kZXggPSBlbGVtZW50cy5wdXNoKGVsZW1lbnQpIC0gMTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0cy5wdXNoKHRhcmdldCk7XG5cbiAgICAgICAgICAgICAgICAgICAgYXR0YWNoZWRMaXN0ZW5lcnMucHVzaCgodXNlQXR0YWNoRXZlbnQgPyB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3VwcGxpZWQ6IFtdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdyYXBwZWQgOiBbXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1c2VDb3VudDogW11cbiAgICAgICAgICAgICAgICAgICAgICAgIH0gOiBudWxsKSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKCF0YXJnZXQuZXZlbnRzW3R5cGVdKSB7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldC5ldmVudHNbdHlwZV0gPSBbXTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0LnR5cGVDb3VudCsrO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICghY29udGFpbnModGFyZ2V0LmV2ZW50c1t0eXBlXSwgbGlzdGVuZXIpKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciByZXQ7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHVzZUF0dGFjaEV2ZW50KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgbGlzdGVuZXJzID0gYXR0YWNoZWRMaXN0ZW5lcnNbZWxlbWVudEluZGV4XSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lckluZGV4ID0gaW5kZXhPZihsaXN0ZW5lcnMuc3VwcGxpZWQsIGxpc3RlbmVyKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHdyYXBwZWQgPSBsaXN0ZW5lcnMud3JhcHBlZFtsaXN0ZW5lckluZGV4XSB8fCBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWV2ZW50LmltbWVkaWF0ZVByb3BhZ2F0aW9uU3RvcHBlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBldmVudC50YXJnZXQgPSBldmVudC5zcmNFbGVtZW50O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBldmVudC5jdXJyZW50VGFyZ2V0ID0gZWxlbWVudDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCA9IGV2ZW50LnByZXZlbnREZWZhdWx0IHx8IHByZXZlbnREZWY7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbiA9IGV2ZW50LnN0b3BQcm9wYWdhdGlvbiB8fCBzdG9wUHJvcDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnQuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uID0gZXZlbnQuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uIHx8IHN0b3BJbW1Qcm9wO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICgvbW91c2V8Y2xpY2svLnRlc3QoZXZlbnQudHlwZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50LnBhZ2VYID0gZXZlbnQuY2xpZW50WCArIGdldFdpbmRvdyhlbGVtZW50KS5kb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc2Nyb2xsTGVmdDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50LnBhZ2VZID0gZXZlbnQuY2xpZW50WSArIGdldFdpbmRvdyhlbGVtZW50KS5kb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc2Nyb2xsVG9wO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXIoZXZlbnQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHJldCA9IGVsZW1lbnRbYWRkRXZlbnRdKG9uICsgdHlwZSwgd3JhcHBlZCwgQm9vbGVhbih1c2VDYXB0dXJlKSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChsaXN0ZW5lckluZGV4ID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpc3RlbmVycy5zdXBwbGllZC5wdXNoKGxpc3RlbmVyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lcnMud3JhcHBlZC5wdXNoKHdyYXBwZWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpc3RlbmVycy51c2VDb3VudC5wdXNoKDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXJzLnVzZUNvdW50W2xpc3RlbmVySW5kZXhdKys7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXQgPSBlbGVtZW50W2FkZEV2ZW50XSh0eXBlLCBsaXN0ZW5lciwgdXNlQ2FwdHVyZSB8fCBmYWxzZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0LmV2ZW50c1t0eXBlXS5wdXNoKGxpc3RlbmVyKTtcblxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmV0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZnVuY3Rpb24gcmVtb3ZlIChlbGVtZW50LCB0eXBlLCBsaXN0ZW5lciwgdXNlQ2FwdHVyZSkge1xuICAgICAgICAgICAgICAgIHZhciBpLFxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50SW5kZXggPSBpbmRleE9mKGVsZW1lbnRzLCBlbGVtZW50KSxcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0ID0gdGFyZ2V0c1tlbGVtZW50SW5kZXhdLFxuICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lcnMsXG4gICAgICAgICAgICAgICAgICAgIGxpc3RlbmVySW5kZXgsXG4gICAgICAgICAgICAgICAgICAgIHdyYXBwZWQgPSBsaXN0ZW5lcjtcblxuICAgICAgICAgICAgICAgIGlmICghdGFyZ2V0IHx8ICF0YXJnZXQuZXZlbnRzKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodXNlQXR0YWNoRXZlbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXJzID0gYXR0YWNoZWRMaXN0ZW5lcnNbZWxlbWVudEluZGV4XTtcbiAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXJJbmRleCA9IGluZGV4T2YobGlzdGVuZXJzLnN1cHBsaWVkLCBsaXN0ZW5lcik7XG4gICAgICAgICAgICAgICAgICAgIHdyYXBwZWQgPSBsaXN0ZW5lcnMud3JhcHBlZFtsaXN0ZW5lckluZGV4XTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodHlwZSA9PT0gJ2FsbCcpIHtcbiAgICAgICAgICAgICAgICAgICAgZm9yICh0eXBlIGluIHRhcmdldC5ldmVudHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0YXJnZXQuZXZlbnRzLmhhc093blByb3BlcnR5KHR5cGUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVtb3ZlKGVsZW1lbnQsIHR5cGUsICdhbGwnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldC5ldmVudHNbdHlwZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGxlbiA9IHRhcmdldC5ldmVudHNbdHlwZV0ubGVuZ3RoO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChsaXN0ZW5lciA9PT0gJ2FsbCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlbW92ZShlbGVtZW50LCB0eXBlLCB0YXJnZXQuZXZlbnRzW3R5cGVdW2ldLCBCb29sZWFuKHVzZUNhcHR1cmUpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0YXJnZXQuZXZlbnRzW3R5cGVdW2ldID09PSBsaXN0ZW5lcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50W3JlbW92ZUV2ZW50XShvbiArIHR5cGUsIHdyYXBwZWQsIHVzZUNhcHR1cmUgfHwgZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXQuZXZlbnRzW3R5cGVdLnNwbGljZShpLCAxKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodXNlQXR0YWNoRXZlbnQgJiYgbGlzdGVuZXJzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lcnMudXNlQ291bnRbbGlzdGVuZXJJbmRleF0tLTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChsaXN0ZW5lcnMudXNlQ291bnRbbGlzdGVuZXJJbmRleF0gPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lcnMuc3VwcGxpZWQuc3BsaWNlKGxpc3RlbmVySW5kZXgsIDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpc3RlbmVycy53cmFwcGVkLnNwbGljZShsaXN0ZW5lckluZGV4LCAxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lcnMudXNlQ291bnQuc3BsaWNlKGxpc3RlbmVySW5kZXgsIDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHRhcmdldC5ldmVudHNbdHlwZV0gJiYgdGFyZ2V0LmV2ZW50c1t0eXBlXS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldC5ldmVudHNbdHlwZV0gPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0LnR5cGVDb3VudC0tO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKCF0YXJnZXQudHlwZUNvdW50KSB7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldHMuc3BsaWNlKGVsZW1lbnRJbmRleCwgMSk7XG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnRzLnNwbGljZShlbGVtZW50SW5kZXgsIDEpO1xuICAgICAgICAgICAgICAgICAgICBhdHRhY2hlZExpc3RlbmVycy5zcGxpY2UoZWxlbWVudEluZGV4LCAxKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIHByZXZlbnREZWYgKCkge1xuICAgICAgICAgICAgICAgIHRoaXMucmV0dXJuVmFsdWUgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZnVuY3Rpb24gc3RvcFByb3AgKCkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FuY2VsQnViYmxlID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZnVuY3Rpb24gc3RvcEltbVByb3AgKCkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2FuY2VsQnViYmxlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB0aGlzLmltbWVkaWF0ZVByb3BhZ2F0aW9uU3RvcHBlZCA9IHRydWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgYWRkOiBhZGQsXG4gICAgICAgICAgICAgICAgcmVtb3ZlOiByZW1vdmUsXG4gICAgICAgICAgICAgICAgdXNlQXR0YWNoRXZlbnQ6IHVzZUF0dGFjaEV2ZW50LFxuXG4gICAgICAgICAgICAgICAgX2VsZW1lbnRzOiBlbGVtZW50cyxcbiAgICAgICAgICAgICAgICBfdGFyZ2V0czogdGFyZ2V0cyxcbiAgICAgICAgICAgICAgICBfYXR0YWNoZWRMaXN0ZW5lcnM6IGF0dGFjaGVkTGlzdGVuZXJzXG4gICAgICAgICAgICB9O1xuICAgICAgICB9KCkpO1xuXG4gICAgZnVuY3Rpb24gYmxhbmsgKCkge31cblxuICAgIGZ1bmN0aW9uIGlzRWxlbWVudCAobykge1xuICAgICAgICBpZiAoIW8gfHwgKHR5cGVvZiBvICE9PSAnb2JqZWN0JykpIHsgcmV0dXJuIGZhbHNlOyB9XG5cbiAgICAgICAgdmFyIF93aW5kb3cgPSBnZXRXaW5kb3cobykgfHwgd2luZG93O1xuXG4gICAgICAgIHJldHVybiAoL29iamVjdHxmdW5jdGlvbi8udGVzdCh0eXBlb2YgX3dpbmRvdy5FbGVtZW50KVxuICAgICAgICAgICAgPyBvIGluc3RhbmNlb2YgX3dpbmRvdy5FbGVtZW50IC8vRE9NMlxuICAgICAgICAgICAgOiBvLm5vZGVUeXBlID09PSAxICYmIHR5cGVvZiBvLm5vZGVOYW1lID09PSBcInN0cmluZ1wiKTtcbiAgICB9XG4gICAgZnVuY3Rpb24gaXNXaW5kb3cgKHRoaW5nKSB7IHJldHVybiB0aGluZyA9PT0gd2luZG93IHx8ICEhKHRoaW5nICYmIHRoaW5nLldpbmRvdykgJiYgKHRoaW5nIGluc3RhbmNlb2YgdGhpbmcuV2luZG93KTsgfVxuICAgIGZ1bmN0aW9uIGlzRG9jRnJhZyAodGhpbmcpIHsgcmV0dXJuICEhdGhpbmcgJiYgdGhpbmcgaW5zdGFuY2VvZiBEb2N1bWVudEZyYWdtZW50OyB9XG4gICAgZnVuY3Rpb24gaXNBcnJheSAodGhpbmcpIHtcbiAgICAgICAgcmV0dXJuIGlzT2JqZWN0KHRoaW5nKVxuICAgICAgICAgICAgICAgICYmICh0eXBlb2YgdGhpbmcubGVuZ3RoICE9PSB1bmRlZmluZWQpXG4gICAgICAgICAgICAgICAgJiYgaXNGdW5jdGlvbih0aGluZy5zcGxpY2UpO1xuICAgIH1cbiAgICBmdW5jdGlvbiBpc09iamVjdCAgICh0aGluZykgeyByZXR1cm4gISF0aGluZyAmJiAodHlwZW9mIHRoaW5nID09PSAnb2JqZWN0Jyk7IH1cbiAgICBmdW5jdGlvbiBpc0Z1bmN0aW9uICh0aGluZykgeyByZXR1cm4gdHlwZW9mIHRoaW5nID09PSAnZnVuY3Rpb24nOyB9XG4gICAgZnVuY3Rpb24gaXNOdW1iZXIgICAodGhpbmcpIHsgcmV0dXJuIHR5cGVvZiB0aGluZyA9PT0gJ251bWJlcicgIDsgfVxuICAgIGZ1bmN0aW9uIGlzQm9vbCAgICAgKHRoaW5nKSB7IHJldHVybiB0eXBlb2YgdGhpbmcgPT09ICdib29sZWFuJyA7IH1cbiAgICBmdW5jdGlvbiBpc1N0cmluZyAgICh0aGluZykgeyByZXR1cm4gdHlwZW9mIHRoaW5nID09PSAnc3RyaW5nJyAgOyB9XG5cbiAgICBmdW5jdGlvbiB0cnlTZWxlY3RvciAodmFsdWUpIHtcbiAgICAgICAgaWYgKCFpc1N0cmluZyh2YWx1ZSkpIHsgcmV0dXJuIGZhbHNlOyB9XG5cbiAgICAgICAgLy8gYW4gZXhjZXB0aW9uIHdpbGwgYmUgcmFpc2VkIGlmIGl0IGlzIGludmFsaWRcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3Rvcih2YWx1ZSk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGV4dGVuZCAoZGVzdCwgc291cmNlKSB7XG4gICAgICAgIGZvciAodmFyIHByb3AgaW4gc291cmNlKSB7XG4gICAgICAgICAgICBkZXN0W3Byb3BdID0gc291cmNlW3Byb3BdO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBkZXN0O1xuICAgIH1cblxuICAgIHZhciBwcmVmaXhlZFByb3BSRXMgPSB7XG4gICAgICB3ZWJraXQ6IC8oTW92ZW1lbnRbWFldfFJhZGl1c1tYWV18Um90YXRpb25BbmdsZXxGb3JjZSkkL1xuICAgIH07XG5cbiAgICBmdW5jdGlvbiBwb2ludGVyRXh0ZW5kIChkZXN0LCBzb3VyY2UpIHtcbiAgICAgICAgZm9yICh2YXIgcHJvcCBpbiBzb3VyY2UpIHtcbiAgICAgICAgICB2YXIgZGVwcmVjYXRlZCA9IGZhbHNlO1xuXG4gICAgICAgICAgLy8gc2tpcCBkZXByZWNhdGVkIHByZWZpeGVkIHByb3BlcnRpZXNcbiAgICAgICAgICBmb3IgKHZhciB2ZW5kb3IgaW4gcHJlZml4ZWRQcm9wUkVzKSB7XG4gICAgICAgICAgICBpZiAocHJvcC5pbmRleE9mKHZlbmRvcikgPT09IDAgJiYgcHJlZml4ZWRQcm9wUkVzW3ZlbmRvcl0udGVzdChwcm9wKSkge1xuICAgICAgICAgICAgICBkZXByZWNhdGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKCFkZXByZWNhdGVkKSB7XG4gICAgICAgICAgICBkZXN0W3Byb3BdID0gc291cmNlW3Byb3BdO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZGVzdDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjb3B5Q29vcmRzIChkZXN0LCBzcmMpIHtcbiAgICAgICAgZGVzdC5wYWdlID0gZGVzdC5wYWdlIHx8IHt9O1xuICAgICAgICBkZXN0LnBhZ2UueCA9IHNyYy5wYWdlLng7XG4gICAgICAgIGRlc3QucGFnZS55ID0gc3JjLnBhZ2UueTtcblxuICAgICAgICBkZXN0LmNsaWVudCA9IGRlc3QuY2xpZW50IHx8IHt9O1xuICAgICAgICBkZXN0LmNsaWVudC54ID0gc3JjLmNsaWVudC54O1xuICAgICAgICBkZXN0LmNsaWVudC55ID0gc3JjLmNsaWVudC55O1xuXG4gICAgICAgIGRlc3QudGltZVN0YW1wID0gc3JjLnRpbWVTdGFtcDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzZXRFdmVudFhZICh0YXJnZXRPYmosIHBvaW50ZXJzLCBpbnRlcmFjdGlvbikge1xuICAgICAgICB2YXIgcG9pbnRlciA9IChwb2ludGVycy5sZW5ndGggPiAxXG4gICAgICAgICAgICAgICAgICAgICAgID8gcG9pbnRlckF2ZXJhZ2UocG9pbnRlcnMpXG4gICAgICAgICAgICAgICAgICAgICAgIDogcG9pbnRlcnNbMF0pO1xuXG4gICAgICAgIGdldFBhZ2VYWShwb2ludGVyLCB0bXBYWSwgaW50ZXJhY3Rpb24pO1xuICAgICAgICB0YXJnZXRPYmoucGFnZS54ID0gdG1wWFkueDtcbiAgICAgICAgdGFyZ2V0T2JqLnBhZ2UueSA9IHRtcFhZLnk7XG5cbiAgICAgICAgZ2V0Q2xpZW50WFkocG9pbnRlciwgdG1wWFksIGludGVyYWN0aW9uKTtcbiAgICAgICAgdGFyZ2V0T2JqLmNsaWVudC54ID0gdG1wWFkueDtcbiAgICAgICAgdGFyZ2V0T2JqLmNsaWVudC55ID0gdG1wWFkueTtcblxuICAgICAgICB0YXJnZXRPYmoudGltZVN0YW1wID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2V0RXZlbnREZWx0YXMgKHRhcmdldE9iaiwgcHJldiwgY3VyKSB7XG4gICAgICAgIHRhcmdldE9iai5wYWdlLnggICAgID0gY3VyLnBhZ2UueCAgICAgIC0gcHJldi5wYWdlLng7XG4gICAgICAgIHRhcmdldE9iai5wYWdlLnkgICAgID0gY3VyLnBhZ2UueSAgICAgIC0gcHJldi5wYWdlLnk7XG4gICAgICAgIHRhcmdldE9iai5jbGllbnQueCAgID0gY3VyLmNsaWVudC54ICAgIC0gcHJldi5jbGllbnQueDtcbiAgICAgICAgdGFyZ2V0T2JqLmNsaWVudC55ICAgPSBjdXIuY2xpZW50LnkgICAgLSBwcmV2LmNsaWVudC55O1xuICAgICAgICB0YXJnZXRPYmoudGltZVN0YW1wID0gbmV3IERhdGUoKS5nZXRUaW1lKCkgLSBwcmV2LnRpbWVTdGFtcDtcblxuICAgICAgICAvLyBzZXQgcG9pbnRlciB2ZWxvY2l0eVxuICAgICAgICB2YXIgZHQgPSBNYXRoLm1heCh0YXJnZXRPYmoudGltZVN0YW1wIC8gMTAwMCwgMC4wMDEpO1xuICAgICAgICB0YXJnZXRPYmoucGFnZS5zcGVlZCAgID0gaHlwb3QodGFyZ2V0T2JqLnBhZ2UueCwgdGFyZ2V0T2JqLnBhZ2UueSkgLyBkdDtcbiAgICAgICAgdGFyZ2V0T2JqLnBhZ2UudnggICAgICA9IHRhcmdldE9iai5wYWdlLnggLyBkdDtcbiAgICAgICAgdGFyZ2V0T2JqLnBhZ2UudnkgICAgICA9IHRhcmdldE9iai5wYWdlLnkgLyBkdDtcblxuICAgICAgICB0YXJnZXRPYmouY2xpZW50LnNwZWVkID0gaHlwb3QodGFyZ2V0T2JqLmNsaWVudC54LCB0YXJnZXRPYmoucGFnZS55KSAvIGR0O1xuICAgICAgICB0YXJnZXRPYmouY2xpZW50LnZ4ICAgID0gdGFyZ2V0T2JqLmNsaWVudC54IC8gZHQ7XG4gICAgICAgIHRhcmdldE9iai5jbGllbnQudnkgICAgPSB0YXJnZXRPYmouY2xpZW50LnkgLyBkdDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpc05hdGl2ZVBvaW50ZXIgKHBvaW50ZXIpIHtcbiAgICAgICAgcmV0dXJuIChwb2ludGVyIGluc3RhbmNlb2Ygd2luZG93LkV2ZW50XG4gICAgICAgICAgICB8fCAoc3VwcG9ydHNUb3VjaCAmJiB3aW5kb3cuVG91Y2ggJiYgcG9pbnRlciBpbnN0YW5jZW9mIHdpbmRvdy5Ub3VjaCkpO1xuICAgIH1cblxuICAgIC8vIEdldCBzcGVjaWZpZWQgWC9ZIGNvb3JkcyBmb3IgbW91c2Ugb3IgZXZlbnQudG91Y2hlc1swXVxuICAgIGZ1bmN0aW9uIGdldFhZICh0eXBlLCBwb2ludGVyLCB4eSkge1xuICAgICAgICB4eSA9IHh5IHx8IHt9O1xuICAgICAgICB0eXBlID0gdHlwZSB8fCAncGFnZSc7XG5cbiAgICAgICAgeHkueCA9IHBvaW50ZXJbdHlwZSArICdYJ107XG4gICAgICAgIHh5LnkgPSBwb2ludGVyW3R5cGUgKyAnWSddO1xuXG4gICAgICAgIHJldHVybiB4eTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRQYWdlWFkgKHBvaW50ZXIsIHBhZ2UpIHtcbiAgICAgICAgcGFnZSA9IHBhZ2UgfHwge307XG5cbiAgICAgICAgLy8gT3BlcmEgTW9iaWxlIGhhbmRsZXMgdGhlIHZpZXdwb3J0IGFuZCBzY3JvbGxpbmcgb2RkbHlcbiAgICAgICAgaWYgKGlzT3BlcmFNb2JpbGUgJiYgaXNOYXRpdmVQb2ludGVyKHBvaW50ZXIpKSB7XG4gICAgICAgICAgICBnZXRYWSgnc2NyZWVuJywgcG9pbnRlciwgcGFnZSk7XG5cbiAgICAgICAgICAgIHBhZ2UueCArPSB3aW5kb3cuc2Nyb2xsWDtcbiAgICAgICAgICAgIHBhZ2UueSArPSB3aW5kb3cuc2Nyb2xsWTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGdldFhZKCdwYWdlJywgcG9pbnRlciwgcGFnZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcGFnZTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRDbGllbnRYWSAocG9pbnRlciwgY2xpZW50KSB7XG4gICAgICAgIGNsaWVudCA9IGNsaWVudCB8fCB7fTtcblxuICAgICAgICBpZiAoaXNPcGVyYU1vYmlsZSAmJiBpc05hdGl2ZVBvaW50ZXIocG9pbnRlcikpIHtcbiAgICAgICAgICAgIC8vIE9wZXJhIE1vYmlsZSBoYW5kbGVzIHRoZSB2aWV3cG9ydCBhbmQgc2Nyb2xsaW5nIG9kZGx5XG4gICAgICAgICAgICBnZXRYWSgnc2NyZWVuJywgcG9pbnRlciwgY2xpZW50KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICBnZXRYWSgnY2xpZW50JywgcG9pbnRlciwgY2xpZW50KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBjbGllbnQ7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0U2Nyb2xsWFkgKHdpbikge1xuICAgICAgICB3aW4gPSB3aW4gfHwgd2luZG93O1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgeDogd2luLnNjcm9sbFggfHwgd2luLmRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zY3JvbGxMZWZ0LFxuICAgICAgICAgICAgeTogd2luLnNjcm9sbFkgfHwgd2luLmRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zY3JvbGxUb3BcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRQb2ludGVySWQgKHBvaW50ZXIpIHtcbiAgICAgICAgcmV0dXJuIGlzTnVtYmVyKHBvaW50ZXIucG9pbnRlcklkKT8gcG9pbnRlci5wb2ludGVySWQgOiBwb2ludGVyLmlkZW50aWZpZXI7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0QWN0dWFsRWxlbWVudCAoZWxlbWVudCkge1xuICAgICAgICByZXR1cm4gKGVsZW1lbnQgaW5zdGFuY2VvZiBTVkdFbGVtZW50SW5zdGFuY2VcbiAgICAgICAgICAgID8gZWxlbWVudC5jb3JyZXNwb25kaW5nVXNlRWxlbWVudFxuICAgICAgICAgICAgOiBlbGVtZW50KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRXaW5kb3cgKG5vZGUpIHtcbiAgICAgICAgaWYgKGlzV2luZG93KG5vZGUpKSB7XG4gICAgICAgICAgICByZXR1cm4gbm9kZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByb290Tm9kZSA9IChub2RlLm93bmVyRG9jdW1lbnQgfHwgbm9kZSk7XG5cbiAgICAgICAgcmV0dXJuIHJvb3ROb2RlLmRlZmF1bHRWaWV3IHx8IHJvb3ROb2RlLnBhcmVudFdpbmRvdyB8fCB3aW5kb3c7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0RWxlbWVudENsaWVudFJlY3QgKGVsZW1lbnQpIHtcbiAgICAgICAgdmFyIGNsaWVudFJlY3QgPSAoZWxlbWVudCBpbnN0YW5jZW9mIFNWR0VsZW1lbnRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA/IGVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA6IGVsZW1lbnQuZ2V0Q2xpZW50UmVjdHMoKVswXSk7XG5cbiAgICAgICAgcmV0dXJuIGNsaWVudFJlY3QgJiYge1xuICAgICAgICAgICAgbGVmdCAgOiBjbGllbnRSZWN0LmxlZnQsXG4gICAgICAgICAgICByaWdodCA6IGNsaWVudFJlY3QucmlnaHQsXG4gICAgICAgICAgICB0b3AgICA6IGNsaWVudFJlY3QudG9wLFxuICAgICAgICAgICAgYm90dG9tOiBjbGllbnRSZWN0LmJvdHRvbSxcbiAgICAgICAgICAgIHdpZHRoIDogY2xpZW50UmVjdC53aWR0aCB8fCBjbGllbnRSZWN0LnJpZ2h0IC0gY2xpZW50UmVjdC5sZWZ0LFxuICAgICAgICAgICAgaGVpZ2h0OiBjbGllbnRSZWN0LmhlaWdodCB8fCBjbGllbnRSZWN0LmJvdHRvbSAtIGNsaWVudFJlY3QudG9wXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0RWxlbWVudFJlY3QgKGVsZW1lbnQpIHtcbiAgICAgICAgdmFyIGNsaWVudFJlY3QgPSBnZXRFbGVtZW50Q2xpZW50UmVjdChlbGVtZW50KTtcblxuICAgICAgICBpZiAoIWlzSU9TNyAmJiBjbGllbnRSZWN0KSB7XG4gICAgICAgICAgICB2YXIgc2Nyb2xsID0gZ2V0U2Nyb2xsWFkoZ2V0V2luZG93KGVsZW1lbnQpKTtcblxuICAgICAgICAgICAgY2xpZW50UmVjdC5sZWZ0ICAgKz0gc2Nyb2xsLng7XG4gICAgICAgICAgICBjbGllbnRSZWN0LnJpZ2h0ICArPSBzY3JvbGwueDtcbiAgICAgICAgICAgIGNsaWVudFJlY3QudG9wICAgICs9IHNjcm9sbC55O1xuICAgICAgICAgICAgY2xpZW50UmVjdC5ib3R0b20gKz0gc2Nyb2xsLnk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gY2xpZW50UmVjdDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRUb3VjaFBhaXIgKGV2ZW50KSB7XG4gICAgICAgIHZhciB0b3VjaGVzID0gW107XG5cbiAgICAgICAgLy8gYXJyYXkgb2YgdG91Y2hlcyBpcyBzdXBwbGllZFxuICAgICAgICBpZiAoaXNBcnJheShldmVudCkpIHtcbiAgICAgICAgICAgIHRvdWNoZXNbMF0gPSBldmVudFswXTtcbiAgICAgICAgICAgIHRvdWNoZXNbMV0gPSBldmVudFsxXTtcbiAgICAgICAgfVxuICAgICAgICAvLyBhbiBldmVudFxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGlmIChldmVudC50eXBlID09PSAndG91Y2hlbmQnKSB7XG4gICAgICAgICAgICAgICAgaWYgKGV2ZW50LnRvdWNoZXMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIHRvdWNoZXNbMF0gPSBldmVudC50b3VjaGVzWzBdO1xuICAgICAgICAgICAgICAgICAgICB0b3VjaGVzWzFdID0gZXZlbnQuY2hhbmdlZFRvdWNoZXNbMF07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKGV2ZW50LnRvdWNoZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHRvdWNoZXNbMF0gPSBldmVudC5jaGFuZ2VkVG91Y2hlc1swXTtcbiAgICAgICAgICAgICAgICAgICAgdG91Y2hlc1sxXSA9IGV2ZW50LmNoYW5nZWRUb3VjaGVzWzFdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHRvdWNoZXNbMF0gPSBldmVudC50b3VjaGVzWzBdO1xuICAgICAgICAgICAgICAgIHRvdWNoZXNbMV0gPSBldmVudC50b3VjaGVzWzFdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRvdWNoZXM7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcG9pbnRlckF2ZXJhZ2UgKHBvaW50ZXJzKSB7XG4gICAgICAgIHZhciBhdmVyYWdlID0ge1xuICAgICAgICAgICAgcGFnZVggIDogMCxcbiAgICAgICAgICAgIHBhZ2VZICA6IDAsXG4gICAgICAgICAgICBjbGllbnRYOiAwLFxuICAgICAgICAgICAgY2xpZW50WTogMCxcbiAgICAgICAgICAgIHNjcmVlblg6IDAsXG4gICAgICAgICAgICBzY3JlZW5ZOiAwXG4gICAgICAgIH07XG4gICAgICAgIHZhciBwcm9wO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcG9pbnRlcnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAocHJvcCBpbiBhdmVyYWdlKSB7XG4gICAgICAgICAgICAgICAgYXZlcmFnZVtwcm9wXSArPSBwb2ludGVyc1tpXVtwcm9wXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBmb3IgKHByb3AgaW4gYXZlcmFnZSkge1xuICAgICAgICAgICAgYXZlcmFnZVtwcm9wXSAvPSBwb2ludGVycy5sZW5ndGg7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gYXZlcmFnZTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB0b3VjaEJCb3ggKGV2ZW50KSB7XG4gICAgICAgIGlmICghZXZlbnQubGVuZ3RoICYmICEoZXZlbnQudG91Y2hlcyAmJiBldmVudC50b3VjaGVzLmxlbmd0aCA+IDEpKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgdG91Y2hlcyA9IGdldFRvdWNoUGFpcihldmVudCksXG4gICAgICAgICAgICBtaW5YID0gTWF0aC5taW4odG91Y2hlc1swXS5wYWdlWCwgdG91Y2hlc1sxXS5wYWdlWCksXG4gICAgICAgICAgICBtaW5ZID0gTWF0aC5taW4odG91Y2hlc1swXS5wYWdlWSwgdG91Y2hlc1sxXS5wYWdlWSksXG4gICAgICAgICAgICBtYXhYID0gTWF0aC5tYXgodG91Y2hlc1swXS5wYWdlWCwgdG91Y2hlc1sxXS5wYWdlWCksXG4gICAgICAgICAgICBtYXhZID0gTWF0aC5tYXgodG91Y2hlc1swXS5wYWdlWSwgdG91Y2hlc1sxXS5wYWdlWSk7XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHg6IG1pblgsXG4gICAgICAgICAgICB5OiBtaW5ZLFxuICAgICAgICAgICAgbGVmdDogbWluWCxcbiAgICAgICAgICAgIHRvcDogbWluWSxcbiAgICAgICAgICAgIHdpZHRoOiBtYXhYIC0gbWluWCxcbiAgICAgICAgICAgIGhlaWdodDogbWF4WSAtIG1pbllcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB0b3VjaERpc3RhbmNlIChldmVudCwgZGVsdGFTb3VyY2UpIHtcbiAgICAgICAgZGVsdGFTb3VyY2UgPSBkZWx0YVNvdXJjZSB8fCBkZWZhdWx0T3B0aW9ucy5kZWx0YVNvdXJjZTtcblxuICAgICAgICB2YXIgc291cmNlWCA9IGRlbHRhU291cmNlICsgJ1gnLFxuICAgICAgICAgICAgc291cmNlWSA9IGRlbHRhU291cmNlICsgJ1knLFxuICAgICAgICAgICAgdG91Y2hlcyA9IGdldFRvdWNoUGFpcihldmVudCk7XG5cblxuICAgICAgICB2YXIgZHggPSB0b3VjaGVzWzBdW3NvdXJjZVhdIC0gdG91Y2hlc1sxXVtzb3VyY2VYXSxcbiAgICAgICAgICAgIGR5ID0gdG91Y2hlc1swXVtzb3VyY2VZXSAtIHRvdWNoZXNbMV1bc291cmNlWV07XG5cbiAgICAgICAgcmV0dXJuIGh5cG90KGR4LCBkeSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdG91Y2hBbmdsZSAoZXZlbnQsIHByZXZBbmdsZSwgZGVsdGFTb3VyY2UpIHtcbiAgICAgICAgZGVsdGFTb3VyY2UgPSBkZWx0YVNvdXJjZSB8fCBkZWZhdWx0T3B0aW9ucy5kZWx0YVNvdXJjZTtcblxuICAgICAgICB2YXIgc291cmNlWCA9IGRlbHRhU291cmNlICsgJ1gnLFxuICAgICAgICAgICAgc291cmNlWSA9IGRlbHRhU291cmNlICsgJ1knLFxuICAgICAgICAgICAgdG91Y2hlcyA9IGdldFRvdWNoUGFpcihldmVudCksXG4gICAgICAgICAgICBkeCA9IHRvdWNoZXNbMF1bc291cmNlWF0gLSB0b3VjaGVzWzFdW3NvdXJjZVhdLFxuICAgICAgICAgICAgZHkgPSB0b3VjaGVzWzBdW3NvdXJjZVldIC0gdG91Y2hlc1sxXVtzb3VyY2VZXSxcbiAgICAgICAgICAgIGFuZ2xlID0gMTgwICogTWF0aC5hdGFuKGR5IC8gZHgpIC8gTWF0aC5QSTtcblxuICAgICAgICBpZiAoaXNOdW1iZXIocHJldkFuZ2xlKSkge1xuICAgICAgICAgICAgdmFyIGRyID0gYW5nbGUgLSBwcmV2QW5nbGUsXG4gICAgICAgICAgICAgICAgZHJDbGFtcGVkID0gZHIgJSAzNjA7XG5cbiAgICAgICAgICAgIGlmIChkckNsYW1wZWQgPiAzMTUpIHtcbiAgICAgICAgICAgICAgICBhbmdsZSAtPSAzNjAgKyAoYW5nbGUgLyAzNjApfDAgKiAzNjA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChkckNsYW1wZWQgPiAxMzUpIHtcbiAgICAgICAgICAgICAgICBhbmdsZSAtPSAxODAgKyAoYW5nbGUgLyAzNjApfDAgKiAzNjA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChkckNsYW1wZWQgPCAtMzE1KSB7XG4gICAgICAgICAgICAgICAgYW5nbGUgKz0gMzYwICsgKGFuZ2xlIC8gMzYwKXwwICogMzYwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoZHJDbGFtcGVkIDwgLTEzNSkge1xuICAgICAgICAgICAgICAgIGFuZ2xlICs9IDE4MCArIChhbmdsZSAvIDM2MCl8MCAqIDM2MDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiAgYW5nbGU7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0T3JpZ2luWFkgKGludGVyYWN0YWJsZSwgZWxlbWVudCkge1xuICAgICAgICB2YXIgb3JpZ2luID0gaW50ZXJhY3RhYmxlXG4gICAgICAgICAgICAgICAgPyBpbnRlcmFjdGFibGUub3B0aW9ucy5vcmlnaW5cbiAgICAgICAgICAgICAgICA6IGRlZmF1bHRPcHRpb25zLm9yaWdpbjtcblxuICAgICAgICBpZiAob3JpZ2luID09PSAncGFyZW50Jykge1xuICAgICAgICAgICAgb3JpZ2luID0gcGFyZW50RWxlbWVudChlbGVtZW50KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChvcmlnaW4gPT09ICdzZWxmJykge1xuICAgICAgICAgICAgb3JpZ2luID0gaW50ZXJhY3RhYmxlLmdldFJlY3QoZWxlbWVudCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodHJ5U2VsZWN0b3Iob3JpZ2luKSkge1xuICAgICAgICAgICAgb3JpZ2luID0gY2xvc2VzdChlbGVtZW50LCBvcmlnaW4pIHx8IHsgeDogMCwgeTogMCB9O1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlzRnVuY3Rpb24ob3JpZ2luKSkge1xuICAgICAgICAgICAgb3JpZ2luID0gb3JpZ2luKGludGVyYWN0YWJsZSAmJiBlbGVtZW50KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChpc0VsZW1lbnQob3JpZ2luKSkgIHtcbiAgICAgICAgICAgIG9yaWdpbiA9IGdldEVsZW1lbnRSZWN0KG9yaWdpbik7XG4gICAgICAgIH1cblxuICAgICAgICBvcmlnaW4ueCA9ICgneCcgaW4gb3JpZ2luKT8gb3JpZ2luLnggOiBvcmlnaW4ubGVmdDtcbiAgICAgICAgb3JpZ2luLnkgPSAoJ3knIGluIG9yaWdpbik/IG9yaWdpbi55IDogb3JpZ2luLnRvcDtcblxuICAgICAgICByZXR1cm4gb3JpZ2luO1xuICAgIH1cblxuICAgIC8vIGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9hLzU2MzQ1MjgvMjI4MDg4OFxuICAgIGZ1bmN0aW9uIF9nZXRRQmV6aWVyVmFsdWUodCwgcDEsIHAyLCBwMykge1xuICAgICAgICB2YXIgaVQgPSAxIC0gdDtcbiAgICAgICAgcmV0dXJuIGlUICogaVQgKiBwMSArIDIgKiBpVCAqIHQgKiBwMiArIHQgKiB0ICogcDM7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0UXVhZHJhdGljQ3VydmVQb2ludChzdGFydFgsIHN0YXJ0WSwgY3BYLCBjcFksIGVuZFgsIGVuZFksIHBvc2l0aW9uKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB4OiAgX2dldFFCZXppZXJWYWx1ZShwb3NpdGlvbiwgc3RhcnRYLCBjcFgsIGVuZFgpLFxuICAgICAgICAgICAgeTogIF9nZXRRQmV6aWVyVmFsdWUocG9zaXRpb24sIHN0YXJ0WSwgY3BZLCBlbmRZKVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIC8vIGh0dHA6Ly9naXptYS5jb20vZWFzaW5nL1xuICAgIGZ1bmN0aW9uIGVhc2VPdXRRdWFkICh0LCBiLCBjLCBkKSB7XG4gICAgICAgIHQgLz0gZDtcbiAgICAgICAgcmV0dXJuIC1jICogdCoodC0yKSArIGI7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbm9kZUNvbnRhaW5zIChwYXJlbnQsIGNoaWxkKSB7XG4gICAgICAgIHdoaWxlIChjaGlsZCkge1xuICAgICAgICAgICAgaWYgKGNoaWxkID09PSBwYXJlbnQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY2hpbGQgPSBjaGlsZC5wYXJlbnROb2RlO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNsb3Nlc3QgKGNoaWxkLCBzZWxlY3Rvcikge1xuICAgICAgICB2YXIgcGFyZW50ID0gcGFyZW50RWxlbWVudChjaGlsZCk7XG5cbiAgICAgICAgd2hpbGUgKGlzRWxlbWVudChwYXJlbnQpKSB7XG4gICAgICAgICAgICBpZiAobWF0Y2hlc1NlbGVjdG9yKHBhcmVudCwgc2VsZWN0b3IpKSB7IHJldHVybiBwYXJlbnQ7IH1cblxuICAgICAgICAgICAgcGFyZW50ID0gcGFyZW50RWxlbWVudChwYXJlbnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGFyZW50RWxlbWVudCAobm9kZSkge1xuICAgICAgICB2YXIgcGFyZW50ID0gbm9kZS5wYXJlbnROb2RlO1xuXG4gICAgICAgIGlmIChpc0RvY0ZyYWcocGFyZW50KSkge1xuICAgICAgICAgICAgLy8gc2tpcCBwYXN0ICNzaGFkby1yb290IGZyYWdtZW50c1xuICAgICAgICAgICAgd2hpbGUgKChwYXJlbnQgPSBwYXJlbnQuaG9zdCkgJiYgaXNEb2NGcmFnKHBhcmVudCkpIHt9XG5cbiAgICAgICAgICAgIHJldHVybiBwYXJlbnQ7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcGFyZW50O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGluQ29udGV4dCAoaW50ZXJhY3RhYmxlLCBlbGVtZW50KSB7XG4gICAgICAgIHJldHVybiBpbnRlcmFjdGFibGUuX2NvbnRleHQgPT09IGVsZW1lbnQub3duZXJEb2N1bWVudFxuICAgICAgICAgICAgICAgIHx8IG5vZGVDb250YWlucyhpbnRlcmFjdGFibGUuX2NvbnRleHQsIGVsZW1lbnQpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHRlc3RJZ25vcmUgKGludGVyYWN0YWJsZSwgaW50ZXJhY3RhYmxlRWxlbWVudCwgZWxlbWVudCkge1xuICAgICAgICB2YXIgaWdub3JlRnJvbSA9IGludGVyYWN0YWJsZS5vcHRpb25zLmlnbm9yZUZyb207XG5cbiAgICAgICAgaWYgKCFpZ25vcmVGcm9tIHx8ICFpc0VsZW1lbnQoZWxlbWVudCkpIHsgcmV0dXJuIGZhbHNlOyB9XG5cbiAgICAgICAgaWYgKGlzU3RyaW5nKGlnbm9yZUZyb20pKSB7XG4gICAgICAgICAgICByZXR1cm4gbWF0Y2hlc1VwVG8oZWxlbWVudCwgaWdub3JlRnJvbSwgaW50ZXJhY3RhYmxlRWxlbWVudCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoaXNFbGVtZW50KGlnbm9yZUZyb20pKSB7XG4gICAgICAgICAgICByZXR1cm4gbm9kZUNvbnRhaW5zKGlnbm9yZUZyb20sIGVsZW1lbnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHRlc3RBbGxvdyAoaW50ZXJhY3RhYmxlLCBpbnRlcmFjdGFibGVFbGVtZW50LCBlbGVtZW50KSB7XG4gICAgICAgIHZhciBhbGxvd0Zyb20gPSBpbnRlcmFjdGFibGUub3B0aW9ucy5hbGxvd0Zyb207XG5cbiAgICAgICAgaWYgKCFhbGxvd0Zyb20pIHsgcmV0dXJuIHRydWU7IH1cblxuICAgICAgICBpZiAoIWlzRWxlbWVudChlbGVtZW50KSkgeyByZXR1cm4gZmFsc2U7IH1cblxuICAgICAgICBpZiAoaXNTdHJpbmcoYWxsb3dGcm9tKSkge1xuICAgICAgICAgICAgcmV0dXJuIG1hdGNoZXNVcFRvKGVsZW1lbnQsIGFsbG93RnJvbSwgaW50ZXJhY3RhYmxlRWxlbWVudCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoaXNFbGVtZW50KGFsbG93RnJvbSkpIHtcbiAgICAgICAgICAgIHJldHVybiBub2RlQ29udGFpbnMoYWxsb3dGcm9tLCBlbGVtZW50KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjaGVja0F4aXMgKGF4aXMsIGludGVyYWN0YWJsZSkge1xuICAgICAgICBpZiAoIWludGVyYWN0YWJsZSkgeyByZXR1cm4gZmFsc2U7IH1cblxuICAgICAgICB2YXIgdGhpc0F4aXMgPSBpbnRlcmFjdGFibGUub3B0aW9ucy5kcmFnLmF4aXM7XG5cbiAgICAgICAgcmV0dXJuIChheGlzID09PSAneHknIHx8IHRoaXNBeGlzID09PSAneHknIHx8IHRoaXNBeGlzID09PSBheGlzKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjaGVja1NuYXAgKGludGVyYWN0YWJsZSwgYWN0aW9uKSB7XG4gICAgICAgIHZhciBvcHRpb25zID0gaW50ZXJhY3RhYmxlLm9wdGlvbnM7XG5cbiAgICAgICAgaWYgKC9ecmVzaXplLy50ZXN0KGFjdGlvbikpIHtcbiAgICAgICAgICAgIGFjdGlvbiA9ICdyZXNpemUnO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG9wdGlvbnNbYWN0aW9uXS5zbmFwICYmIG9wdGlvbnNbYWN0aW9uXS5zbmFwLmVuYWJsZWQ7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY2hlY2tSZXN0cmljdCAoaW50ZXJhY3RhYmxlLCBhY3Rpb24pIHtcbiAgICAgICAgdmFyIG9wdGlvbnMgPSBpbnRlcmFjdGFibGUub3B0aW9ucztcblxuICAgICAgICBpZiAoL15yZXNpemUvLnRlc3QoYWN0aW9uKSkge1xuICAgICAgICAgICAgYWN0aW9uID0gJ3Jlc2l6ZSc7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gIG9wdGlvbnNbYWN0aW9uXS5yZXN0cmljdCAmJiBvcHRpb25zW2FjdGlvbl0ucmVzdHJpY3QuZW5hYmxlZDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjaGVja0F1dG9TY3JvbGwgKGludGVyYWN0YWJsZSwgYWN0aW9uKSB7XG4gICAgICAgIHZhciBvcHRpb25zID0gaW50ZXJhY3RhYmxlLm9wdGlvbnM7XG5cbiAgICAgICAgaWYgKC9ecmVzaXplLy50ZXN0KGFjdGlvbikpIHtcbiAgICAgICAgICAgIGFjdGlvbiA9ICdyZXNpemUnO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuICBvcHRpb25zW2FjdGlvbl0uYXV0b1Njcm9sbCAmJiBvcHRpb25zW2FjdGlvbl0uYXV0b1Njcm9sbC5lbmFibGVkO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHdpdGhpbkludGVyYWN0aW9uTGltaXQgKGludGVyYWN0YWJsZSwgZWxlbWVudCwgYWN0aW9uKSB7XG4gICAgICAgIHZhciBvcHRpb25zID0gaW50ZXJhY3RhYmxlLm9wdGlvbnMsXG4gICAgICAgICAgICBtYXhBY3Rpb25zID0gb3B0aW9uc1thY3Rpb24ubmFtZV0ubWF4LFxuICAgICAgICAgICAgbWF4UGVyRWxlbWVudCA9IG9wdGlvbnNbYWN0aW9uLm5hbWVdLm1heFBlckVsZW1lbnQsXG4gICAgICAgICAgICBhY3RpdmVJbnRlcmFjdGlvbnMgPSAwLFxuICAgICAgICAgICAgdGFyZ2V0Q291bnQgPSAwLFxuICAgICAgICAgICAgdGFyZ2V0RWxlbWVudENvdW50ID0gMDtcblxuICAgICAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gaW50ZXJhY3Rpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgaW50ZXJhY3Rpb24gPSBpbnRlcmFjdGlvbnNbaV0sXG4gICAgICAgICAgICAgICAgb3RoZXJBY3Rpb24gPSBpbnRlcmFjdGlvbi5wcmVwYXJlZC5uYW1lLFxuICAgICAgICAgICAgICAgIGFjdGl2ZSA9IGludGVyYWN0aW9uLmludGVyYWN0aW5nKCk7XG5cbiAgICAgICAgICAgIGlmICghYWN0aXZlKSB7IGNvbnRpbnVlOyB9XG5cbiAgICAgICAgICAgIGFjdGl2ZUludGVyYWN0aW9ucysrO1xuXG4gICAgICAgICAgICBpZiAoYWN0aXZlSW50ZXJhY3Rpb25zID49IG1heEludGVyYWN0aW9ucykge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGludGVyYWN0aW9uLnRhcmdldCAhPT0gaW50ZXJhY3RhYmxlKSB7IGNvbnRpbnVlOyB9XG5cbiAgICAgICAgICAgIHRhcmdldENvdW50ICs9IChvdGhlckFjdGlvbiA9PT0gYWN0aW9uLm5hbWUpfDA7XG5cbiAgICAgICAgICAgIGlmICh0YXJnZXRDb3VudCA+PSBtYXhBY3Rpb25zKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoaW50ZXJhY3Rpb24uZWxlbWVudCA9PT0gZWxlbWVudCkge1xuICAgICAgICAgICAgICAgIHRhcmdldEVsZW1lbnRDb3VudCsrO1xuXG4gICAgICAgICAgICAgICAgaWYgKG90aGVyQWN0aW9uICE9PSBhY3Rpb24ubmFtZSB8fCB0YXJnZXRFbGVtZW50Q291bnQgPj0gbWF4UGVyRWxlbWVudCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG1heEludGVyYWN0aW9ucyA+IDA7XG4gICAgfVxuXG4gICAgLy8gVGVzdCBmb3IgdGhlIGVsZW1lbnQgdGhhdCdzIFwiYWJvdmVcIiBhbGwgb3RoZXIgcXVhbGlmaWVyc1xuICAgIGZ1bmN0aW9uIGluZGV4T2ZEZWVwZXN0RWxlbWVudCAoZWxlbWVudHMpIHtcbiAgICAgICAgdmFyIGRyb3B6b25lLFxuICAgICAgICAgICAgZGVlcGVzdFpvbmUgPSBlbGVtZW50c1swXSxcbiAgICAgICAgICAgIGluZGV4ID0gZGVlcGVzdFpvbmU/IDA6IC0xLFxuICAgICAgICAgICAgcGFyZW50LFxuICAgICAgICAgICAgZGVlcGVzdFpvbmVQYXJlbnRzID0gW10sXG4gICAgICAgICAgICBkcm9wem9uZVBhcmVudHMgPSBbXSxcbiAgICAgICAgICAgIGNoaWxkLFxuICAgICAgICAgICAgaSxcbiAgICAgICAgICAgIG47XG5cbiAgICAgICAgZm9yIChpID0gMTsgaSA8IGVsZW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBkcm9wem9uZSA9IGVsZW1lbnRzW2ldO1xuXG4gICAgICAgICAgICAvLyBhbiBlbGVtZW50IG1pZ2h0IGJlbG9uZyB0byBtdWx0aXBsZSBzZWxlY3RvciBkcm9wem9uZXNcbiAgICAgICAgICAgIGlmICghZHJvcHpvbmUgfHwgZHJvcHpvbmUgPT09IGRlZXBlc3Rab25lKSB7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghZGVlcGVzdFpvbmUpIHtcbiAgICAgICAgICAgICAgICBkZWVwZXN0Wm9uZSA9IGRyb3B6b25lO1xuICAgICAgICAgICAgICAgIGluZGV4ID0gaTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gY2hlY2sgaWYgdGhlIGRlZXBlc3Qgb3IgY3VycmVudCBhcmUgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50IG9yIGRvY3VtZW50LnJvb3RFbGVtZW50XG4gICAgICAgICAgICAvLyAtIGlmIHRoZSBjdXJyZW50IGRyb3B6b25lIGlzLCBkbyBub3RoaW5nIGFuZCBjb250aW51ZVxuICAgICAgICAgICAgaWYgKGRyb3B6b25lLnBhcmVudE5vZGUgPT09IGRyb3B6b25lLm93bmVyRG9jdW1lbnQpIHtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIC0gaWYgZGVlcGVzdCBpcywgdXBkYXRlIHdpdGggdGhlIGN1cnJlbnQgZHJvcHpvbmUgYW5kIGNvbnRpbnVlIHRvIG5leHRcbiAgICAgICAgICAgIGVsc2UgaWYgKGRlZXBlc3Rab25lLnBhcmVudE5vZGUgPT09IGRyb3B6b25lLm93bmVyRG9jdW1lbnQpIHtcbiAgICAgICAgICAgICAgICBkZWVwZXN0Wm9uZSA9IGRyb3B6b25lO1xuICAgICAgICAgICAgICAgIGluZGV4ID0gaTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCFkZWVwZXN0Wm9uZVBhcmVudHMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgcGFyZW50ID0gZGVlcGVzdFpvbmU7XG4gICAgICAgICAgICAgICAgd2hpbGUgKHBhcmVudC5wYXJlbnROb2RlICYmIHBhcmVudC5wYXJlbnROb2RlICE9PSBwYXJlbnQub3duZXJEb2N1bWVudCkge1xuICAgICAgICAgICAgICAgICAgICBkZWVwZXN0Wm9uZVBhcmVudHMudW5zaGlmdChwYXJlbnQpO1xuICAgICAgICAgICAgICAgICAgICBwYXJlbnQgPSBwYXJlbnQucGFyZW50Tm9kZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGlmIHRoaXMgZWxlbWVudCBpcyBhbiBzdmcgZWxlbWVudCBhbmQgdGhlIGN1cnJlbnQgZGVlcGVzdCBpc1xuICAgICAgICAgICAgLy8gYW4gSFRNTEVsZW1lbnRcbiAgICAgICAgICAgIGlmIChkZWVwZXN0Wm9uZSBpbnN0YW5jZW9mIEhUTUxFbGVtZW50XG4gICAgICAgICAgICAgICAgJiYgZHJvcHpvbmUgaW5zdGFuY2VvZiBTVkdFbGVtZW50XG4gICAgICAgICAgICAgICAgJiYgIShkcm9wem9uZSBpbnN0YW5jZW9mIFNWR1NWR0VsZW1lbnQpKSB7XG5cbiAgICAgICAgICAgICAgICBpZiAoZHJvcHpvbmUgPT09IGRlZXBlc3Rab25lLnBhcmVudE5vZGUpIHtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcGFyZW50ID0gZHJvcHpvbmUub3duZXJTVkdFbGVtZW50O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcGFyZW50ID0gZHJvcHpvbmU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGRyb3B6b25lUGFyZW50cyA9IFtdO1xuXG4gICAgICAgICAgICB3aGlsZSAocGFyZW50LnBhcmVudE5vZGUgIT09IHBhcmVudC5vd25lckRvY3VtZW50KSB7XG4gICAgICAgICAgICAgICAgZHJvcHpvbmVQYXJlbnRzLnVuc2hpZnQocGFyZW50KTtcbiAgICAgICAgICAgICAgICBwYXJlbnQgPSBwYXJlbnQucGFyZW50Tm9kZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbiA9IDA7XG5cbiAgICAgICAgICAgIC8vIGdldCAocG9zaXRpb24gb2YgbGFzdCBjb21tb24gYW5jZXN0b3IpICsgMVxuICAgICAgICAgICAgd2hpbGUgKGRyb3B6b25lUGFyZW50c1tuXSAmJiBkcm9wem9uZVBhcmVudHNbbl0gPT09IGRlZXBlc3Rab25lUGFyZW50c1tuXSkge1xuICAgICAgICAgICAgICAgIG4rKztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHBhcmVudHMgPSBbXG4gICAgICAgICAgICAgICAgZHJvcHpvbmVQYXJlbnRzW24gLSAxXSxcbiAgICAgICAgICAgICAgICBkcm9wem9uZVBhcmVudHNbbl0sXG4gICAgICAgICAgICAgICAgZGVlcGVzdFpvbmVQYXJlbnRzW25dXG4gICAgICAgICAgICBdO1xuXG4gICAgICAgICAgICBjaGlsZCA9IHBhcmVudHNbMF0ubGFzdENoaWxkO1xuXG4gICAgICAgICAgICB3aGlsZSAoY2hpbGQpIHtcbiAgICAgICAgICAgICAgICBpZiAoY2hpbGQgPT09IHBhcmVudHNbMV0pIHtcbiAgICAgICAgICAgICAgICAgICAgZGVlcGVzdFpvbmUgPSBkcm9wem9uZTtcbiAgICAgICAgICAgICAgICAgICAgaW5kZXggPSBpO1xuICAgICAgICAgICAgICAgICAgICBkZWVwZXN0Wm9uZVBhcmVudHMgPSBbXTtcblxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoY2hpbGQgPT09IHBhcmVudHNbMl0pIHtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgY2hpbGQgPSBjaGlsZC5wcmV2aW91c1NpYmxpbmc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gaW5kZXg7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gSW50ZXJhY3Rpb24gKCkge1xuICAgICAgICB0aGlzLnRhcmdldCAgICAgICAgICA9IG51bGw7IC8vIGN1cnJlbnQgaW50ZXJhY3RhYmxlIGJlaW5nIGludGVyYWN0ZWQgd2l0aFxuICAgICAgICB0aGlzLmVsZW1lbnQgICAgICAgICA9IG51bGw7IC8vIHRoZSB0YXJnZXQgZWxlbWVudCBvZiB0aGUgaW50ZXJhY3RhYmxlXG4gICAgICAgIHRoaXMuZHJvcFRhcmdldCAgICAgID0gbnVsbDsgLy8gdGhlIGRyb3B6b25lIGEgZHJhZyB0YXJnZXQgbWlnaHQgYmUgZHJvcHBlZCBpbnRvXG4gICAgICAgIHRoaXMuZHJvcEVsZW1lbnQgICAgID0gbnVsbDsgLy8gdGhlIGVsZW1lbnQgYXQgdGhlIHRpbWUgb2YgY2hlY2tpbmdcbiAgICAgICAgdGhpcy5wcmV2RHJvcFRhcmdldCAgPSBudWxsOyAvLyB0aGUgZHJvcHpvbmUgdGhhdCB3YXMgcmVjZW50bHkgZHJhZ2dlZCBhd2F5IGZyb21cbiAgICAgICAgdGhpcy5wcmV2RHJvcEVsZW1lbnQgPSBudWxsOyAvLyB0aGUgZWxlbWVudCBhdCB0aGUgdGltZSBvZiBjaGVja2luZ1xuXG4gICAgICAgIHRoaXMucHJlcGFyZWQgICAgICAgID0geyAgICAgLy8gYWN0aW9uIHRoYXQncyByZWFkeSB0byBiZSBmaXJlZCBvbiBuZXh0IG1vdmUgZXZlbnRcbiAgICAgICAgICAgIG5hbWUgOiBudWxsLFxuICAgICAgICAgICAgYXhpcyA6IG51bGwsXG4gICAgICAgICAgICBlZGdlczogbnVsbFxuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMubWF0Y2hlcyAgICAgICAgID0gW107ICAgLy8gYWxsIHNlbGVjdG9ycyB0aGF0IGFyZSBtYXRjaGVkIGJ5IHRhcmdldCBlbGVtZW50XG4gICAgICAgIHRoaXMubWF0Y2hFbGVtZW50cyAgID0gW107ICAgLy8gY29ycmVzcG9uZGluZyBlbGVtZW50c1xuXG4gICAgICAgIHRoaXMuaW5lcnRpYVN0YXR1cyA9IHtcbiAgICAgICAgICAgIGFjdGl2ZSAgICAgICA6IGZhbHNlLFxuICAgICAgICAgICAgc21vb3RoRW5kICAgIDogZmFsc2UsXG4gICAgICAgICAgICBlbmRpbmcgICAgICAgOiBmYWxzZSxcblxuICAgICAgICAgICAgc3RhcnRFdmVudDogbnVsbCxcbiAgICAgICAgICAgIHVwQ29vcmRzOiB7fSxcblxuICAgICAgICAgICAgeGU6IDAsIHllOiAwLFxuICAgICAgICAgICAgc3g6IDAsIHN5OiAwLFxuXG4gICAgICAgICAgICB0MDogMCxcbiAgICAgICAgICAgIHZ4MDogMCwgdnlzOiAwLFxuICAgICAgICAgICAgZHVyYXRpb246IDAsXG5cbiAgICAgICAgICAgIHJlc3VtZUR4OiAwLFxuICAgICAgICAgICAgcmVzdW1lRHk6IDAsXG5cbiAgICAgICAgICAgIGxhbWJkYV92MDogMCxcbiAgICAgICAgICAgIG9uZV92ZV92MDogMCxcbiAgICAgICAgICAgIGkgIDogbnVsbFxuICAgICAgICB9O1xuXG4gICAgICAgIGlmIChpc0Z1bmN0aW9uKEZ1bmN0aW9uLnByb3RvdHlwZS5iaW5kKSkge1xuICAgICAgICAgICAgdGhpcy5ib3VuZEluZXJ0aWFGcmFtZSA9IHRoaXMuaW5lcnRpYUZyYW1lLmJpbmQodGhpcyk7XG4gICAgICAgICAgICB0aGlzLmJvdW5kU21vb3RoRW5kRnJhbWUgPSB0aGlzLnNtb290aEVuZEZyYW1lLmJpbmQodGhpcyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgdGhhdCA9IHRoaXM7XG5cbiAgICAgICAgICAgIHRoaXMuYm91bmRJbmVydGlhRnJhbWUgPSBmdW5jdGlvbiAoKSB7IHJldHVybiB0aGF0LmluZXJ0aWFGcmFtZSgpOyB9O1xuICAgICAgICAgICAgdGhpcy5ib3VuZFNtb290aEVuZEZyYW1lID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gdGhhdC5zbW9vdGhFbmRGcmFtZSgpOyB9O1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5hY3RpdmVEcm9wcyA9IHtcbiAgICAgICAgICAgIGRyb3B6b25lczogW10sICAgICAgLy8gdGhlIGRyb3B6b25lcyB0aGF0IGFyZSBtZW50aW9uZWQgYmVsb3dcbiAgICAgICAgICAgIGVsZW1lbnRzIDogW10sICAgICAgLy8gZWxlbWVudHMgb2YgZHJvcHpvbmVzIHRoYXQgYWNjZXB0IHRoZSB0YXJnZXQgZHJhZ2dhYmxlXG4gICAgICAgICAgICByZWN0cyAgICA6IFtdICAgICAgIC8vIHRoZSByZWN0cyBvZiB0aGUgZWxlbWVudHMgbWVudGlvbmVkIGFib3ZlXG4gICAgICAgIH07XG5cbiAgICAgICAgLy8ga2VlcCB0cmFjayBvZiBhZGRlZCBwb2ludGVyc1xuICAgICAgICB0aGlzLnBvaW50ZXJzICAgID0gW107XG4gICAgICAgIHRoaXMucG9pbnRlcklkcyAgPSBbXTtcbiAgICAgICAgdGhpcy5kb3duVGFyZ2V0cyA9IFtdO1xuICAgICAgICB0aGlzLmRvd25UaW1lcyAgID0gW107XG4gICAgICAgIHRoaXMuaG9sZFRpbWVycyAgPSBbXTtcblxuICAgICAgICAvLyBQcmV2aW91cyBuYXRpdmUgcG9pbnRlciBtb3ZlIGV2ZW50IGNvb3JkaW5hdGVzXG4gICAgICAgIHRoaXMucHJldkNvb3JkcyA9IHtcbiAgICAgICAgICAgIHBhZ2UgICAgIDogeyB4OiAwLCB5OiAwIH0sXG4gICAgICAgICAgICBjbGllbnQgICA6IHsgeDogMCwgeTogMCB9LFxuICAgICAgICAgICAgdGltZVN0YW1wOiAwXG4gICAgICAgIH07XG4gICAgICAgIC8vIGN1cnJlbnQgbmF0aXZlIHBvaW50ZXIgbW92ZSBldmVudCBjb29yZGluYXRlc1xuICAgICAgICB0aGlzLmN1ckNvb3JkcyA9IHtcbiAgICAgICAgICAgIHBhZ2UgICAgIDogeyB4OiAwLCB5OiAwIH0sXG4gICAgICAgICAgICBjbGllbnQgICA6IHsgeDogMCwgeTogMCB9LFxuICAgICAgICAgICAgdGltZVN0YW1wOiAwXG4gICAgICAgIH07XG5cbiAgICAgICAgLy8gU3RhcnRpbmcgSW50ZXJhY3RFdmVudCBwb2ludGVyIGNvb3JkaW5hdGVzXG4gICAgICAgIHRoaXMuc3RhcnRDb29yZHMgPSB7XG4gICAgICAgICAgICBwYWdlICAgICA6IHsgeDogMCwgeTogMCB9LFxuICAgICAgICAgICAgY2xpZW50ICAgOiB7IHg6IDAsIHk6IDAgfSxcbiAgICAgICAgICAgIHRpbWVTdGFtcDogMFxuICAgICAgICB9O1xuXG4gICAgICAgIC8vIENoYW5nZSBpbiBjb29yZGluYXRlcyBhbmQgdGltZSBvZiB0aGUgcG9pbnRlclxuICAgICAgICB0aGlzLnBvaW50ZXJEZWx0YSA9IHtcbiAgICAgICAgICAgIHBhZ2UgICAgIDogeyB4OiAwLCB5OiAwLCB2eDogMCwgdnk6IDAsIHNwZWVkOiAwIH0sXG4gICAgICAgICAgICBjbGllbnQgICA6IHsgeDogMCwgeTogMCwgdng6IDAsIHZ5OiAwLCBzcGVlZDogMCB9LFxuICAgICAgICAgICAgdGltZVN0YW1wOiAwXG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5kb3duRXZlbnQgICA9IG51bGw7ICAgIC8vIHBvaW50ZXJkb3duL21vdXNlZG93bi90b3VjaHN0YXJ0IGV2ZW50XG4gICAgICAgIHRoaXMuZG93blBvaW50ZXIgPSB7fTtcblxuICAgICAgICB0aGlzLl9ldmVudFRhcmdldCAgICA9IG51bGw7XG4gICAgICAgIHRoaXMuX2N1ckV2ZW50VGFyZ2V0ID0gbnVsbDtcblxuICAgICAgICB0aGlzLnByZXZFdmVudCA9IG51bGw7ICAgICAgLy8gcHJldmlvdXMgYWN0aW9uIGV2ZW50XG4gICAgICAgIHRoaXMudGFwVGltZSAgID0gMDsgICAgICAgICAvLyB0aW1lIG9mIHRoZSBtb3N0IHJlY2VudCB0YXAgZXZlbnRcbiAgICAgICAgdGhpcy5wcmV2VGFwICAgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuc3RhcnRPZmZzZXQgICAgPSB7IGxlZnQ6IDAsIHJpZ2h0OiAwLCB0b3A6IDAsIGJvdHRvbTogMCB9O1xuICAgICAgICB0aGlzLnJlc3RyaWN0T2Zmc2V0ID0geyBsZWZ0OiAwLCByaWdodDogMCwgdG9wOiAwLCBib3R0b206IDAgfTtcbiAgICAgICAgdGhpcy5zbmFwT2Zmc2V0cyAgICA9IFtdO1xuXG4gICAgICAgIHRoaXMuZ2VzdHVyZSA9IHtcbiAgICAgICAgICAgIHN0YXJ0OiB7IHg6IDAsIHk6IDAgfSxcblxuICAgICAgICAgICAgc3RhcnREaXN0YW5jZTogMCwgICAvLyBkaXN0YW5jZSBiZXR3ZWVuIHR3byB0b3VjaGVzIG9mIHRvdWNoU3RhcnRcbiAgICAgICAgICAgIHByZXZEaXN0YW5jZSA6IDAsXG4gICAgICAgICAgICBkaXN0YW5jZSAgICAgOiAwLFxuXG4gICAgICAgICAgICBzY2FsZTogMSwgICAgICAgICAgIC8vIGdlc3R1cmUuZGlzdGFuY2UgLyBnZXN0dXJlLnN0YXJ0RGlzdGFuY2VcblxuICAgICAgICAgICAgc3RhcnRBbmdsZTogMCwgICAgICAvLyBhbmdsZSBvZiBsaW5lIGpvaW5pbmcgdHdvIHRvdWNoZXNcbiAgICAgICAgICAgIHByZXZBbmdsZSA6IDAgICAgICAgLy8gYW5nbGUgb2YgdGhlIHByZXZpb3VzIGdlc3R1cmUgZXZlbnRcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLnNuYXBTdGF0dXMgPSB7XG4gICAgICAgICAgICB4ICAgICAgIDogMCwgeSAgICAgICA6IDAsXG4gICAgICAgICAgICBkeCAgICAgIDogMCwgZHkgICAgICA6IDAsXG4gICAgICAgICAgICByZWFsWCAgIDogMCwgcmVhbFkgICA6IDAsXG4gICAgICAgICAgICBzbmFwcGVkWDogMCwgc25hcHBlZFk6IDAsXG4gICAgICAgICAgICB0YXJnZXRzIDogW10sXG4gICAgICAgICAgICBsb2NrZWQgIDogZmFsc2UsXG4gICAgICAgICAgICBjaGFuZ2VkIDogZmFsc2VcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLnJlc3RyaWN0U3RhdHVzID0ge1xuICAgICAgICAgICAgZHggICAgICAgICA6IDAsIGR5ICAgICAgICAgOiAwLFxuICAgICAgICAgICAgcmVzdHJpY3RlZFg6IDAsIHJlc3RyaWN0ZWRZOiAwLFxuICAgICAgICAgICAgc25hcCAgICAgICA6IG51bGwsXG4gICAgICAgICAgICByZXN0cmljdGVkIDogZmFsc2UsXG4gICAgICAgICAgICBjaGFuZ2VkICAgIDogZmFsc2VcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLnJlc3RyaWN0U3RhdHVzLnNuYXAgPSB0aGlzLnNuYXBTdGF0dXM7XG5cbiAgICAgICAgdGhpcy5wb2ludGVySXNEb3duICAgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5wb2ludGVyV2FzTW92ZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5nZXN0dXJpbmcgICAgICAgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5kcmFnZ2luZyAgICAgICAgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5yZXNpemluZyAgICAgICAgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5yZXNpemVBeGVzICAgICAgPSAneHknO1xuXG4gICAgICAgIHRoaXMubW91c2UgPSBmYWxzZTtcblxuICAgICAgICBpbnRlcmFjdGlvbnMucHVzaCh0aGlzKTtcbiAgICB9XG5cbiAgICBJbnRlcmFjdGlvbi5wcm90b3R5cGUgPSB7XG4gICAgICAgIGdldFBhZ2VYWSAgOiBmdW5jdGlvbiAocG9pbnRlciwgeHkpIHsgcmV0dXJuICAgZ2V0UGFnZVhZKHBvaW50ZXIsIHh5LCB0aGlzKTsgfSxcbiAgICAgICAgZ2V0Q2xpZW50WFk6IGZ1bmN0aW9uIChwb2ludGVyLCB4eSkgeyByZXR1cm4gZ2V0Q2xpZW50WFkocG9pbnRlciwgeHksIHRoaXMpOyB9LFxuICAgICAgICBzZXRFdmVudFhZIDogZnVuY3Rpb24gKHRhcmdldCwgcHRyKSB7IHJldHVybiAgc2V0RXZlbnRYWSh0YXJnZXQsIHB0ciwgdGhpcyk7IH0sXG5cbiAgICAgICAgcG9pbnRlck92ZXI6IGZ1bmN0aW9uIChwb2ludGVyLCBldmVudCwgZXZlbnRUYXJnZXQpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLnByZXBhcmVkLm5hbWUgfHwgIXRoaXMubW91c2UpIHsgcmV0dXJuOyB9XG5cbiAgICAgICAgICAgIHZhciBjdXJNYXRjaGVzID0gW10sXG4gICAgICAgICAgICAgICAgY3VyTWF0Y2hFbGVtZW50cyA9IFtdLFxuICAgICAgICAgICAgICAgIHByZXZUYXJnZXRFbGVtZW50ID0gdGhpcy5lbGVtZW50O1xuXG4gICAgICAgICAgICB0aGlzLmFkZFBvaW50ZXIocG9pbnRlcik7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLnRhcmdldFxuICAgICAgICAgICAgICAgICYmICh0ZXN0SWdub3JlKHRoaXMudGFyZ2V0LCB0aGlzLmVsZW1lbnQsIGV2ZW50VGFyZ2V0KVxuICAgICAgICAgICAgICAgICAgICB8fCAhdGVzdEFsbG93KHRoaXMudGFyZ2V0LCB0aGlzLmVsZW1lbnQsIGV2ZW50VGFyZ2V0KSkpIHtcbiAgICAgICAgICAgICAgICAvLyBpZiB0aGUgZXZlbnRUYXJnZXQgc2hvdWxkIGJlIGlnbm9yZWQgb3Igc2hvdWxkbid0IGJlIGFsbG93ZWRcbiAgICAgICAgICAgICAgICAvLyBjbGVhciB0aGUgcHJldmlvdXMgdGFyZ2V0XG4gICAgICAgICAgICAgICAgdGhpcy50YXJnZXQgPSBudWxsO1xuICAgICAgICAgICAgICAgIHRoaXMuZWxlbWVudCA9IG51bGw7XG4gICAgICAgICAgICAgICAgdGhpcy5tYXRjaGVzID0gW107XG4gICAgICAgICAgICAgICAgdGhpcy5tYXRjaEVsZW1lbnRzID0gW107XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBlbGVtZW50SW50ZXJhY3RhYmxlID0gaW50ZXJhY3RhYmxlcy5nZXQoZXZlbnRUYXJnZXQpLFxuICAgICAgICAgICAgICAgIGVsZW1lbnRBY3Rpb24gPSAoZWxlbWVudEludGVyYWN0YWJsZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJiYgIXRlc3RJZ25vcmUoZWxlbWVudEludGVyYWN0YWJsZSwgZXZlbnRUYXJnZXQsIGV2ZW50VGFyZ2V0KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJiYgdGVzdEFsbG93KGVsZW1lbnRJbnRlcmFjdGFibGUsIGV2ZW50VGFyZ2V0LCBldmVudFRhcmdldClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICYmIHZhbGlkYXRlQWN0aW9uKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnRJbnRlcmFjdGFibGUuZ2V0QWN0aW9uKHBvaW50ZXIsIGV2ZW50LCB0aGlzLCBldmVudFRhcmdldCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudEludGVyYWN0YWJsZSkpO1xuXG4gICAgICAgICAgICBpZiAoZWxlbWVudEFjdGlvbiAmJiAhd2l0aGluSW50ZXJhY3Rpb25MaW1pdChlbGVtZW50SW50ZXJhY3RhYmxlLCBldmVudFRhcmdldCwgZWxlbWVudEFjdGlvbikpIHtcbiAgICAgICAgICAgICAgICAgZWxlbWVudEFjdGlvbiA9IG51bGw7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIHB1c2hDdXJNYXRjaGVzIChpbnRlcmFjdGFibGUsIHNlbGVjdG9yKSB7XG4gICAgICAgICAgICAgICAgaWYgKGludGVyYWN0YWJsZVxuICAgICAgICAgICAgICAgICAgICAmJiBpbkNvbnRleHQoaW50ZXJhY3RhYmxlLCBldmVudFRhcmdldClcbiAgICAgICAgICAgICAgICAgICAgJiYgIXRlc3RJZ25vcmUoaW50ZXJhY3RhYmxlLCBldmVudFRhcmdldCwgZXZlbnRUYXJnZXQpXG4gICAgICAgICAgICAgICAgICAgICYmIHRlc3RBbGxvdyhpbnRlcmFjdGFibGUsIGV2ZW50VGFyZ2V0LCBldmVudFRhcmdldClcbiAgICAgICAgICAgICAgICAgICAgJiYgbWF0Y2hlc1NlbGVjdG9yKGV2ZW50VGFyZ2V0LCBzZWxlY3RvcikpIHtcblxuICAgICAgICAgICAgICAgICAgICBjdXJNYXRjaGVzLnB1c2goaW50ZXJhY3RhYmxlKTtcbiAgICAgICAgICAgICAgICAgICAgY3VyTWF0Y2hFbGVtZW50cy5wdXNoKGV2ZW50VGFyZ2V0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChlbGVtZW50QWN0aW9uKSB7XG4gICAgICAgICAgICAgICAgdGhpcy50YXJnZXQgPSBlbGVtZW50SW50ZXJhY3RhYmxlO1xuICAgICAgICAgICAgICAgIHRoaXMuZWxlbWVudCA9IGV2ZW50VGFyZ2V0O1xuICAgICAgICAgICAgICAgIHRoaXMubWF0Y2hlcyA9IFtdO1xuICAgICAgICAgICAgICAgIHRoaXMubWF0Y2hFbGVtZW50cyA9IFtdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgaW50ZXJhY3RhYmxlcy5mb3JFYWNoU2VsZWN0b3IocHVzaEN1ck1hdGNoZXMpO1xuXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMudmFsaWRhdGVTZWxlY3Rvcihwb2ludGVyLCBldmVudCwgY3VyTWF0Y2hlcywgY3VyTWF0Y2hFbGVtZW50cykpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5tYXRjaGVzID0gY3VyTWF0Y2hlcztcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5tYXRjaEVsZW1lbnRzID0gY3VyTWF0Y2hFbGVtZW50cztcblxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBvaW50ZXJIb3Zlcihwb2ludGVyLCBldmVudCwgdGhpcy5tYXRjaGVzLCB0aGlzLm1hdGNoRWxlbWVudHMpO1xuICAgICAgICAgICAgICAgICAgICBldmVudHMuYWRkKGV2ZW50VGFyZ2V0LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFBvaW50ZXJFdmVudD8gcEV2ZW50VHlwZXMubW92ZSA6ICdtb3VzZW1vdmUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpc3RlbmVycy5wb2ludGVySG92ZXIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmICh0aGlzLnRhcmdldCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAobm9kZUNvbnRhaW5zKHByZXZUYXJnZXRFbGVtZW50LCBldmVudFRhcmdldCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucG9pbnRlckhvdmVyKHBvaW50ZXIsIGV2ZW50LCB0aGlzLm1hdGNoZXMsIHRoaXMubWF0Y2hFbGVtZW50cyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBldmVudHMuYWRkKHRoaXMuZWxlbWVudCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgUG9pbnRlckV2ZW50PyBwRXZlbnRUeXBlcy5tb3ZlIDogJ21vdXNlbW92ZScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpc3RlbmVycy5wb2ludGVySG92ZXIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy50YXJnZXQgPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbGVtZW50ID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubWF0Y2hlcyA9IFtdO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5tYXRjaEVsZW1lbnRzID0gW107XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgLy8gQ2hlY2sgd2hhdCBhY3Rpb24gd291bGQgYmUgcGVyZm9ybWVkIG9uIHBvaW50ZXJNb3ZlIHRhcmdldCBpZiBhIG1vdXNlXG4gICAgICAgIC8vIGJ1dHRvbiB3ZXJlIHByZXNzZWQgYW5kIGNoYW5nZSB0aGUgY3Vyc29yIGFjY29yZGluZ2x5XG4gICAgICAgIHBvaW50ZXJIb3ZlcjogZnVuY3Rpb24gKHBvaW50ZXIsIGV2ZW50LCBldmVudFRhcmdldCwgY3VyRXZlbnRUYXJnZXQsIG1hdGNoZXMsIG1hdGNoRWxlbWVudHMpIHtcbiAgICAgICAgICAgIHZhciB0YXJnZXQgPSB0aGlzLnRhcmdldDtcblxuICAgICAgICAgICAgaWYgKCF0aGlzLnByZXBhcmVkLm5hbWUgJiYgdGhpcy5tb3VzZSkge1xuXG4gICAgICAgICAgICAgICAgdmFyIGFjdGlvbjtcblxuICAgICAgICAgICAgICAgIC8vIHVwZGF0ZSBwb2ludGVyIGNvb3JkcyBmb3IgZGVmYXVsdEFjdGlvbkNoZWNrZXIgdG8gdXNlXG4gICAgICAgICAgICAgICAgdGhpcy5zZXRFdmVudFhZKHRoaXMuY3VyQ29vcmRzLCBbcG9pbnRlcl0pO1xuXG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgYWN0aW9uID0gdGhpcy52YWxpZGF0ZVNlbGVjdG9yKHBvaW50ZXIsIGV2ZW50LCBtYXRjaGVzLCBtYXRjaEVsZW1lbnRzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAodGFyZ2V0KSB7XG4gICAgICAgICAgICAgICAgICAgIGFjdGlvbiA9IHZhbGlkYXRlQWN0aW9uKHRhcmdldC5nZXRBY3Rpb24odGhpcy5wb2ludGVyc1swXSwgZXZlbnQsIHRoaXMsIHRoaXMuZWxlbWVudCksIHRoaXMudGFyZ2V0KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0ICYmIHRhcmdldC5vcHRpb25zLnN0eWxlQ3Vyc29yKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhY3Rpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldC5fZG9jLmRvY3VtZW50RWxlbWVudC5zdHlsZS5jdXJzb3IgPSBnZXRBY3Rpb25DdXJzb3IoYWN0aW9uKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldC5fZG9jLmRvY3VtZW50RWxlbWVudC5zdHlsZS5jdXJzb3IgPSAnJztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKHRoaXMucHJlcGFyZWQubmFtZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2hlY2tBbmRQcmV2ZW50RGVmYXVsdChldmVudCwgdGFyZ2V0LCB0aGlzLmVsZW1lbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIHBvaW50ZXJPdXQ6IGZ1bmN0aW9uIChwb2ludGVyLCBldmVudCwgZXZlbnRUYXJnZXQpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLnByZXBhcmVkLm5hbWUpIHsgcmV0dXJuOyB9XG5cbiAgICAgICAgICAgIC8vIFJlbW92ZSB0ZW1wb3JhcnkgZXZlbnQgbGlzdGVuZXJzIGZvciBzZWxlY3RvciBJbnRlcmFjdGFibGVzXG4gICAgICAgICAgICBpZiAoIWludGVyYWN0YWJsZXMuZ2V0KGV2ZW50VGFyZ2V0KSkge1xuICAgICAgICAgICAgICAgIGV2ZW50cy5yZW1vdmUoZXZlbnRUYXJnZXQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBQb2ludGVyRXZlbnQ/IHBFdmVudFR5cGVzLm1vdmUgOiAnbW91c2Vtb3ZlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpc3RlbmVycy5wb2ludGVySG92ZXIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodGhpcy50YXJnZXQgJiYgdGhpcy50YXJnZXQub3B0aW9ucy5zdHlsZUN1cnNvciAmJiAhdGhpcy5pbnRlcmFjdGluZygpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy50YXJnZXQuX2RvYy5kb2N1bWVudEVsZW1lbnQuc3R5bGUuY3Vyc29yID0gJyc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgc2VsZWN0b3JEb3duOiBmdW5jdGlvbiAocG9pbnRlciwgZXZlbnQsIGV2ZW50VGFyZ2V0LCBjdXJFdmVudFRhcmdldCkge1xuICAgICAgICAgICAgdmFyIHRoYXQgPSB0aGlzLFxuICAgICAgICAgICAgICAgIC8vIGNvcHkgZXZlbnQgdG8gYmUgdXNlZCBpbiB0aW1lb3V0IGZvciBJRThcbiAgICAgICAgICAgICAgICBldmVudENvcHkgPSBldmVudHMudXNlQXR0YWNoRXZlbnQ/IGV4dGVuZCh7fSwgZXZlbnQpIDogZXZlbnQsXG4gICAgICAgICAgICAgICAgZWxlbWVudCA9IGV2ZW50VGFyZ2V0LFxuICAgICAgICAgICAgICAgIHBvaW50ZXJJbmRleCA9IHRoaXMuYWRkUG9pbnRlcihwb2ludGVyKSxcbiAgICAgICAgICAgICAgICBhY3Rpb247XG5cbiAgICAgICAgICAgIHRoaXMuaG9sZFRpbWVyc1twb2ludGVySW5kZXhdID0gc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgdGhhdC5wb2ludGVySG9sZChldmVudHMudXNlQXR0YWNoRXZlbnQ/IGV2ZW50Q29weSA6IHBvaW50ZXIsIGV2ZW50Q29weSwgZXZlbnRUYXJnZXQsIGN1ckV2ZW50VGFyZ2V0KTtcbiAgICAgICAgICAgIH0sIGRlZmF1bHRPcHRpb25zLl9ob2xkRHVyYXRpb24pO1xuXG4gICAgICAgICAgICB0aGlzLnBvaW50ZXJJc0Rvd24gPSB0cnVlO1xuXG4gICAgICAgICAgICAvLyBDaGVjayBpZiB0aGUgZG93biBldmVudCBoaXRzIHRoZSBjdXJyZW50IGluZXJ0aWEgdGFyZ2V0XG4gICAgICAgICAgICBpZiAodGhpcy5pbmVydGlhU3RhdHVzLmFjdGl2ZSAmJiB0aGlzLnRhcmdldC5zZWxlY3Rvcikge1xuICAgICAgICAgICAgICAgIC8vIGNsaW1iIHVwIHRoZSBET00gdHJlZSBmcm9tIHRoZSBldmVudCB0YXJnZXRcbiAgICAgICAgICAgICAgICB3aGlsZSAoaXNFbGVtZW50KGVsZW1lbnQpKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gaWYgdGhpcyBlbGVtZW50IGlzIHRoZSBjdXJyZW50IGluZXJ0aWEgdGFyZ2V0IGVsZW1lbnRcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVsZW1lbnQgPT09IHRoaXMuZWxlbWVudFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gYW5kIHRoZSBwcm9zcGVjdGl2ZSBhY3Rpb24gaXMgdGhlIHNhbWUgYXMgdGhlIG9uZ29pbmcgb25lXG4gICAgICAgICAgICAgICAgICAgICAgICAmJiB2YWxpZGF0ZUFjdGlvbih0aGlzLnRhcmdldC5nZXRBY3Rpb24ocG9pbnRlciwgZXZlbnQsIHRoaXMsIHRoaXMuZWxlbWVudCksIHRoaXMudGFyZ2V0KS5uYW1lID09PSB0aGlzLnByZXBhcmVkLm5hbWUpIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gc3RvcCBpbmVydGlhIHNvIHRoYXQgdGhlIG5leHQgbW92ZSB3aWxsIGJlIGEgbm9ybWFsIG9uZVxuICAgICAgICAgICAgICAgICAgICAgICAgY2FuY2VsRnJhbWUodGhpcy5pbmVydGlhU3RhdHVzLmkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5pbmVydGlhU3RhdHVzLmFjdGl2ZSA9IGZhbHNlO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbGxlY3RFdmVudFRhcmdldHMocG9pbnRlciwgZXZlbnQsIGV2ZW50VGFyZ2V0LCAnZG93bicpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnQgPSBwYXJlbnRFbGVtZW50KGVsZW1lbnQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gZG8gbm90aGluZyBpZiBpbnRlcmFjdGluZ1xuICAgICAgICAgICAgaWYgKHRoaXMuaW50ZXJhY3RpbmcoKSkge1xuICAgICAgICAgICAgICAgIHRoaXMuY29sbGVjdEV2ZW50VGFyZ2V0cyhwb2ludGVyLCBldmVudCwgZXZlbnRUYXJnZXQsICdkb3duJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmdW5jdGlvbiBwdXNoTWF0Y2hlcyAoaW50ZXJhY3RhYmxlLCBzZWxlY3RvciwgY29udGV4dCkge1xuICAgICAgICAgICAgICAgIHZhciBlbGVtZW50cyA9IGllOE1hdGNoZXNTZWxlY3RvclxuICAgICAgICAgICAgICAgICAgICA/IGNvbnRleHQucXVlcnlTZWxlY3RvckFsbChzZWxlY3RvcilcbiAgICAgICAgICAgICAgICAgICAgOiB1bmRlZmluZWQ7XG5cbiAgICAgICAgICAgICAgICBpZiAoaW5Db250ZXh0KGludGVyYWN0YWJsZSwgZWxlbWVudClcbiAgICAgICAgICAgICAgICAgICAgJiYgIXRlc3RJZ25vcmUoaW50ZXJhY3RhYmxlLCBlbGVtZW50LCBldmVudFRhcmdldClcbiAgICAgICAgICAgICAgICAgICAgJiYgdGVzdEFsbG93KGludGVyYWN0YWJsZSwgZWxlbWVudCwgZXZlbnRUYXJnZXQpXG4gICAgICAgICAgICAgICAgICAgICYmIG1hdGNoZXNTZWxlY3RvcihlbGVtZW50LCBzZWxlY3RvciwgZWxlbWVudHMpKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgdGhhdC5tYXRjaGVzLnB1c2goaW50ZXJhY3RhYmxlKTtcbiAgICAgICAgICAgICAgICAgICAgdGhhdC5tYXRjaEVsZW1lbnRzLnB1c2goZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyB1cGRhdGUgcG9pbnRlciBjb29yZHMgZm9yIGRlZmF1bHRBY3Rpb25DaGVja2VyIHRvIHVzZVxuICAgICAgICAgICAgdGhpcy5zZXRFdmVudFhZKHRoaXMuY3VyQ29vcmRzLCBbcG9pbnRlcl0pO1xuICAgICAgICAgICAgdGhpcy5kb3duRXZlbnQgPSBldmVudDtcblxuICAgICAgICAgICAgd2hpbGUgKGlzRWxlbWVudChlbGVtZW50KSAmJiAhYWN0aW9uKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5tYXRjaGVzID0gW107XG4gICAgICAgICAgICAgICAgdGhpcy5tYXRjaEVsZW1lbnRzID0gW107XG5cbiAgICAgICAgICAgICAgICBpbnRlcmFjdGFibGVzLmZvckVhY2hTZWxlY3RvcihwdXNoTWF0Y2hlcyk7XG5cbiAgICAgICAgICAgICAgICBhY3Rpb24gPSB0aGlzLnZhbGlkYXRlU2VsZWN0b3IocG9pbnRlciwgZXZlbnQsIHRoaXMubWF0Y2hlcywgdGhpcy5tYXRjaEVsZW1lbnRzKTtcbiAgICAgICAgICAgICAgICBlbGVtZW50ID0gcGFyZW50RWxlbWVudChlbGVtZW50KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGFjdGlvbikge1xuICAgICAgICAgICAgICAgIHRoaXMucHJlcGFyZWQubmFtZSAgPSBhY3Rpb24ubmFtZTtcbiAgICAgICAgICAgICAgICB0aGlzLnByZXBhcmVkLmF4aXMgID0gYWN0aW9uLmF4aXM7XG4gICAgICAgICAgICAgICAgdGhpcy5wcmVwYXJlZC5lZGdlcyA9IGFjdGlvbi5lZGdlcztcblxuICAgICAgICAgICAgICAgIHRoaXMuY29sbGVjdEV2ZW50VGFyZ2V0cyhwb2ludGVyLCBldmVudCwgZXZlbnRUYXJnZXQsICdkb3duJyk7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5wb2ludGVyRG93bihwb2ludGVyLCBldmVudCwgZXZlbnRUYXJnZXQsIGN1ckV2ZW50VGFyZ2V0LCBhY3Rpb24pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gZG8gdGhlc2Ugbm93IHNpbmNlIHBvaW50ZXJEb3duIGlzbid0IGJlaW5nIGNhbGxlZCBmcm9tIGhlcmVcbiAgICAgICAgICAgICAgICB0aGlzLmRvd25UaW1lc1twb2ludGVySW5kZXhdID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5kb3duVGFyZ2V0c1twb2ludGVySW5kZXhdID0gZXZlbnRUYXJnZXQ7XG4gICAgICAgICAgICAgICAgcG9pbnRlckV4dGVuZCh0aGlzLmRvd25Qb2ludGVyLCBwb2ludGVyKTtcblxuICAgICAgICAgICAgICAgIGNvcHlDb29yZHModGhpcy5wcmV2Q29vcmRzLCB0aGlzLmN1ckNvb3Jkcyk7XG4gICAgICAgICAgICAgICAgdGhpcy5wb2ludGVyV2FzTW92ZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5jb2xsZWN0RXZlbnRUYXJnZXRzKHBvaW50ZXIsIGV2ZW50LCBldmVudFRhcmdldCwgJ2Rvd24nKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvLyBEZXRlcm1pbmUgYWN0aW9uIHRvIGJlIHBlcmZvcm1lZCBvbiBuZXh0IHBvaW50ZXJNb3ZlIGFuZCBhZGQgYXBwcm9wcmlhdGVcbiAgICAgICAgLy8gc3R5bGUgYW5kIGV2ZW50IExpc3RlbmVyc1xuICAgICAgICBwb2ludGVyRG93bjogZnVuY3Rpb24gKHBvaW50ZXIsIGV2ZW50LCBldmVudFRhcmdldCwgY3VyRXZlbnRUYXJnZXQsIGZvcmNlQWN0aW9uKSB7XG4gICAgICAgICAgICBpZiAoIWZvcmNlQWN0aW9uICYmICF0aGlzLmluZXJ0aWFTdGF0dXMuYWN0aXZlICYmIHRoaXMucG9pbnRlcldhc01vdmVkICYmIHRoaXMucHJlcGFyZWQubmFtZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2hlY2tBbmRQcmV2ZW50RGVmYXVsdChldmVudCwgdGhpcy50YXJnZXQsIHRoaXMuZWxlbWVudCk7XG5cbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMucG9pbnRlcklzRG93biA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLmRvd25FdmVudCA9IGV2ZW50O1xuXG4gICAgICAgICAgICB2YXIgcG9pbnRlckluZGV4ID0gdGhpcy5hZGRQb2ludGVyKHBvaW50ZXIpLFxuICAgICAgICAgICAgICAgIGFjdGlvbjtcblxuICAgICAgICAgICAgLy8gSWYgaXQgaXMgdGhlIHNlY29uZCB0b3VjaCBvZiBhIG11bHRpLXRvdWNoIGdlc3R1cmUsIGtlZXAgdGhlXG4gICAgICAgICAgICAvLyB0YXJnZXQgdGhlIHNhbWUgYW5kIGdldCBhIG5ldyBhY3Rpb24gaWYgYSB0YXJnZXQgd2FzIHNldCBieSB0aGVcbiAgICAgICAgICAgIC8vIGZpcnN0IHRvdWNoXG4gICAgICAgICAgICBpZiAodGhpcy5wb2ludGVySWRzLmxlbmd0aCA+IDEgJiYgdGhpcy50YXJnZXQuX2VsZW1lbnQgPT09IHRoaXMuZWxlbWVudCkge1xuICAgICAgICAgICAgICAgIHZhciBuZXdBY3Rpb24gPSB2YWxpZGF0ZUFjdGlvbihmb3JjZUFjdGlvbiB8fCB0aGlzLnRhcmdldC5nZXRBY3Rpb24ocG9pbnRlciwgZXZlbnQsIHRoaXMsIHRoaXMuZWxlbWVudCksIHRoaXMudGFyZ2V0KTtcblxuICAgICAgICAgICAgICAgIGlmICh3aXRoaW5JbnRlcmFjdGlvbkxpbWl0KHRoaXMudGFyZ2V0LCB0aGlzLmVsZW1lbnQsIG5ld0FjdGlvbikpIHtcbiAgICAgICAgICAgICAgICAgICAgYWN0aW9uID0gbmV3QWN0aW9uO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRoaXMucHJlcGFyZWQubmFtZSA9IG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBPdGhlcndpc2UsIHNldCB0aGUgdGFyZ2V0IGlmIHRoZXJlIGlzIG5vIGFjdGlvbiBwcmVwYXJlZFxuICAgICAgICAgICAgZWxzZSBpZiAoIXRoaXMucHJlcGFyZWQubmFtZSkge1xuICAgICAgICAgICAgICAgIHZhciBpbnRlcmFjdGFibGUgPSBpbnRlcmFjdGFibGVzLmdldChjdXJFdmVudFRhcmdldCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoaW50ZXJhY3RhYmxlXG4gICAgICAgICAgICAgICAgICAgICYmICF0ZXN0SWdub3JlKGludGVyYWN0YWJsZSwgY3VyRXZlbnRUYXJnZXQsIGV2ZW50VGFyZ2V0KVxuICAgICAgICAgICAgICAgICAgICAmJiB0ZXN0QWxsb3coaW50ZXJhY3RhYmxlLCBjdXJFdmVudFRhcmdldCwgZXZlbnRUYXJnZXQpXG4gICAgICAgICAgICAgICAgICAgICYmIChhY3Rpb24gPSB2YWxpZGF0ZUFjdGlvbihmb3JjZUFjdGlvbiB8fCBpbnRlcmFjdGFibGUuZ2V0QWN0aW9uKHBvaW50ZXIsIGV2ZW50LCB0aGlzLCBjdXJFdmVudFRhcmdldCksIGludGVyYWN0YWJsZSwgZXZlbnRUYXJnZXQpKVxuICAgICAgICAgICAgICAgICAgICAmJiB3aXRoaW5JbnRlcmFjdGlvbkxpbWl0KGludGVyYWN0YWJsZSwgY3VyRXZlbnRUYXJnZXQsIGFjdGlvbikpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50YXJnZXQgPSBpbnRlcmFjdGFibGU7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZWxlbWVudCA9IGN1ckV2ZW50VGFyZ2V0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHRhcmdldCA9IHRoaXMudGFyZ2V0LFxuICAgICAgICAgICAgICAgIG9wdGlvbnMgPSB0YXJnZXQgJiYgdGFyZ2V0Lm9wdGlvbnM7XG5cbiAgICAgICAgICAgIGlmICh0YXJnZXQgJiYgKGZvcmNlQWN0aW9uIHx8ICF0aGlzLnByZXBhcmVkLm5hbWUpKSB7XG4gICAgICAgICAgICAgICAgYWN0aW9uID0gYWN0aW9uIHx8IHZhbGlkYXRlQWN0aW9uKGZvcmNlQWN0aW9uIHx8IHRhcmdldC5nZXRBY3Rpb24ocG9pbnRlciwgZXZlbnQsIHRoaXMsIGN1ckV2ZW50VGFyZ2V0KSwgdGFyZ2V0LCB0aGlzLmVsZW1lbnQpO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5zZXRFdmVudFhZKHRoaXMuc3RhcnRDb29yZHMsIHRoaXMucG9pbnRlcnMpO1xuXG4gICAgICAgICAgICAgICAgaWYgKCFhY3Rpb24pIHsgcmV0dXJuOyB9XG5cbiAgICAgICAgICAgICAgICBpZiAob3B0aW9ucy5zdHlsZUN1cnNvcikge1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQuX2RvYy5kb2N1bWVudEVsZW1lbnQuc3R5bGUuY3Vyc29yID0gZ2V0QWN0aW9uQ3Vyc29yKGFjdGlvbik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdGhpcy5yZXNpemVBeGVzID0gYWN0aW9uLm5hbWUgPT09ICdyZXNpemUnPyBhY3Rpb24uYXhpcyA6IG51bGw7XG5cbiAgICAgICAgICAgICAgICBpZiAoYWN0aW9uID09PSAnZ2VzdHVyZScgJiYgdGhpcy5wb2ludGVySWRzLmxlbmd0aCA8IDIpIHtcbiAgICAgICAgICAgICAgICAgICAgYWN0aW9uID0gbnVsbDtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0aGlzLnByZXBhcmVkLm5hbWUgID0gYWN0aW9uLm5hbWU7XG4gICAgICAgICAgICAgICAgdGhpcy5wcmVwYXJlZC5heGlzICA9IGFjdGlvbi5heGlzO1xuICAgICAgICAgICAgICAgIHRoaXMucHJlcGFyZWQuZWRnZXMgPSBhY3Rpb24uZWRnZXM7XG5cbiAgICAgICAgICAgICAgICB0aGlzLnNuYXBTdGF0dXMuc25hcHBlZFggPSB0aGlzLnNuYXBTdGF0dXMuc25hcHBlZFkgPVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnJlc3RyaWN0U3RhdHVzLnJlc3RyaWN0ZWRYID0gdGhpcy5yZXN0cmljdFN0YXR1cy5yZXN0cmljdGVkWSA9IE5hTjtcblxuICAgICAgICAgICAgICAgIHRoaXMuZG93blRpbWVzW3BvaW50ZXJJbmRleF0gPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmRvd25UYXJnZXRzW3BvaW50ZXJJbmRleF0gPSBldmVudFRhcmdldDtcbiAgICAgICAgICAgICAgICBwb2ludGVyRXh0ZW5kKHRoaXMuZG93blBvaW50ZXIsIHBvaW50ZXIpO1xuXG4gICAgICAgICAgICAgICAgY29weUNvb3Jkcyh0aGlzLnByZXZDb29yZHMsIHRoaXMuc3RhcnRDb29yZHMpO1xuICAgICAgICAgICAgICAgIHRoaXMucG9pbnRlcldhc01vdmVkID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgICB0aGlzLmNoZWNrQW5kUHJldmVudERlZmF1bHQoZXZlbnQsIHRhcmdldCwgdGhpcy5lbGVtZW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIGlmIGluZXJ0aWEgaXMgYWN0aXZlIHRyeSB0byByZXN1bWUgYWN0aW9uXG4gICAgICAgICAgICBlbHNlIGlmICh0aGlzLmluZXJ0aWFTdGF0dXMuYWN0aXZlXG4gICAgICAgICAgICAgICAgJiYgY3VyRXZlbnRUYXJnZXQgPT09IHRoaXMuZWxlbWVudFxuICAgICAgICAgICAgICAgICYmIHZhbGlkYXRlQWN0aW9uKHRhcmdldC5nZXRBY3Rpb24ocG9pbnRlciwgZXZlbnQsIHRoaXMsIHRoaXMuZWxlbWVudCksIHRhcmdldCkubmFtZSA9PT0gdGhpcy5wcmVwYXJlZC5uYW1lKSB7XG5cbiAgICAgICAgICAgICAgICBjYW5jZWxGcmFtZSh0aGlzLmluZXJ0aWFTdGF0dXMuaSk7XG4gICAgICAgICAgICAgICAgdGhpcy5pbmVydGlhU3RhdHVzLmFjdGl2ZSA9IGZhbHNlO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5jaGVja0FuZFByZXZlbnREZWZhdWx0KGV2ZW50LCB0YXJnZXQsIHRoaXMuZWxlbWVudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgc2V0TW9kaWZpY2F0aW9uczogZnVuY3Rpb24gKGNvb3JkcywgcHJlRW5kKSB7XG4gICAgICAgICAgICB2YXIgdGFyZ2V0ICAgICAgICAgPSB0aGlzLnRhcmdldCxcbiAgICAgICAgICAgICAgICBzaG91bGRNb3ZlICAgICA9IHRydWUsXG4gICAgICAgICAgICAgICAgc2hvdWxkU25hcCAgICAgPSBjaGVja1NuYXAodGFyZ2V0LCB0aGlzLnByZXBhcmVkLm5hbWUpICAgICAmJiAoIXRhcmdldC5vcHRpb25zW3RoaXMucHJlcGFyZWQubmFtZV0uc25hcC5lbmRPbmx5ICAgICB8fCBwcmVFbmQpLFxuICAgICAgICAgICAgICAgIHNob3VsZFJlc3RyaWN0ID0gY2hlY2tSZXN0cmljdCh0YXJnZXQsIHRoaXMucHJlcGFyZWQubmFtZSkgJiYgKCF0YXJnZXQub3B0aW9uc1t0aGlzLnByZXBhcmVkLm5hbWVdLnJlc3RyaWN0LmVuZE9ubHkgfHwgcHJlRW5kKTtcblxuICAgICAgICAgICAgaWYgKHNob3VsZFNuYXAgICAgKSB7IHRoaXMuc2V0U25hcHBpbmcgICAoY29vcmRzKTsgfSBlbHNlIHsgdGhpcy5zbmFwU3RhdHVzICAgIC5sb2NrZWQgICAgID0gZmFsc2U7IH1cbiAgICAgICAgICAgIGlmIChzaG91bGRSZXN0cmljdCkgeyB0aGlzLnNldFJlc3RyaWN0aW9uKGNvb3Jkcyk7IH0gZWxzZSB7IHRoaXMucmVzdHJpY3RTdGF0dXMucmVzdHJpY3RlZCA9IGZhbHNlOyB9XG5cbiAgICAgICAgICAgIGlmIChzaG91bGRTbmFwICYmIHRoaXMuc25hcFN0YXR1cy5sb2NrZWQgJiYgIXRoaXMuc25hcFN0YXR1cy5jaGFuZ2VkKSB7XG4gICAgICAgICAgICAgICAgc2hvdWxkTW92ZSA9IHNob3VsZFJlc3RyaWN0ICYmIHRoaXMucmVzdHJpY3RTdGF0dXMucmVzdHJpY3RlZCAmJiB0aGlzLnJlc3RyaWN0U3RhdHVzLmNoYW5nZWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChzaG91bGRSZXN0cmljdCAmJiB0aGlzLnJlc3RyaWN0U3RhdHVzLnJlc3RyaWN0ZWQgJiYgIXRoaXMucmVzdHJpY3RTdGF0dXMuY2hhbmdlZCkge1xuICAgICAgICAgICAgICAgIHNob3VsZE1vdmUgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHNob3VsZE1vdmU7XG4gICAgICAgIH0sXG5cbiAgICAgICAgc2V0U3RhcnRPZmZzZXRzOiBmdW5jdGlvbiAoYWN0aW9uLCBpbnRlcmFjdGFibGUsIGVsZW1lbnQpIHtcbiAgICAgICAgICAgIHZhciByZWN0ID0gaW50ZXJhY3RhYmxlLmdldFJlY3QoZWxlbWVudCksXG4gICAgICAgICAgICAgICAgb3JpZ2luID0gZ2V0T3JpZ2luWFkoaW50ZXJhY3RhYmxlLCBlbGVtZW50KSxcbiAgICAgICAgICAgICAgICBzbmFwID0gaW50ZXJhY3RhYmxlLm9wdGlvbnNbdGhpcy5wcmVwYXJlZC5uYW1lXS5zbmFwLFxuICAgICAgICAgICAgICAgIHJlc3RyaWN0ID0gaW50ZXJhY3RhYmxlLm9wdGlvbnNbdGhpcy5wcmVwYXJlZC5uYW1lXS5yZXN0cmljdCxcbiAgICAgICAgICAgICAgICB3aWR0aCwgaGVpZ2h0O1xuXG4gICAgICAgICAgICBpZiAocmVjdCkge1xuICAgICAgICAgICAgICAgIHRoaXMuc3RhcnRPZmZzZXQubGVmdCA9IHRoaXMuc3RhcnRDb29yZHMucGFnZS54IC0gcmVjdC5sZWZ0O1xuICAgICAgICAgICAgICAgIHRoaXMuc3RhcnRPZmZzZXQudG9wICA9IHRoaXMuc3RhcnRDb29yZHMucGFnZS55IC0gcmVjdC50b3A7XG5cbiAgICAgICAgICAgICAgICB0aGlzLnN0YXJ0T2Zmc2V0LnJpZ2h0ICA9IHJlY3QucmlnaHQgIC0gdGhpcy5zdGFydENvb3Jkcy5wYWdlLng7XG4gICAgICAgICAgICAgICAgdGhpcy5zdGFydE9mZnNldC5ib3R0b20gPSByZWN0LmJvdHRvbSAtIHRoaXMuc3RhcnRDb29yZHMucGFnZS55O1xuXG4gICAgICAgICAgICAgICAgaWYgKCd3aWR0aCcgaW4gcmVjdCkgeyB3aWR0aCA9IHJlY3Qud2lkdGg7IH1cbiAgICAgICAgICAgICAgICBlbHNlIHsgd2lkdGggPSByZWN0LnJpZ2h0IC0gcmVjdC5sZWZ0OyB9XG4gICAgICAgICAgICAgICAgaWYgKCdoZWlnaHQnIGluIHJlY3QpIHsgaGVpZ2h0ID0gcmVjdC5oZWlnaHQ7IH1cbiAgICAgICAgICAgICAgICBlbHNlIHsgaGVpZ2h0ID0gcmVjdC5ib3R0b20gLSByZWN0LnRvcDsgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zdGFydE9mZnNldC5sZWZ0ID0gdGhpcy5zdGFydE9mZnNldC50b3AgPSB0aGlzLnN0YXJ0T2Zmc2V0LnJpZ2h0ID0gdGhpcy5zdGFydE9mZnNldC5ib3R0b20gPSAwO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLnNuYXBPZmZzZXRzLnNwbGljZSgwKTtcblxuICAgICAgICAgICAgdmFyIHNuYXBPZmZzZXQgPSBzbmFwICYmIHNuYXAub2Zmc2V0ID09PSAnc3RhcnRDb29yZHMnXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgID8ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgeDogdGhpcy5zdGFydENvb3Jkcy5wYWdlLnggLSBvcmlnaW4ueCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHk6IHRoaXMuc3RhcnRDb29yZHMucGFnZS55IC0gb3JpZ2luLnlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA6IHNuYXAgJiYgc25hcC5vZmZzZXQgfHwgeyB4OiAwLCB5OiAwIH07XG5cbiAgICAgICAgICAgIGlmIChyZWN0ICYmIHNuYXAgJiYgc25hcC5yZWxhdGl2ZVBvaW50cyAmJiBzbmFwLnJlbGF0aXZlUG9pbnRzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc25hcC5yZWxhdGl2ZVBvaW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNuYXBPZmZzZXRzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgeDogdGhpcy5zdGFydE9mZnNldC5sZWZ0IC0gKHdpZHRoICAqIHNuYXAucmVsYXRpdmVQb2ludHNbaV0ueCkgKyBzbmFwT2Zmc2V0LngsXG4gICAgICAgICAgICAgICAgICAgICAgICB5OiB0aGlzLnN0YXJ0T2Zmc2V0LnRvcCAgLSAoaGVpZ2h0ICogc25hcC5yZWxhdGl2ZVBvaW50c1tpXS55KSArIHNuYXBPZmZzZXQueVxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNuYXBPZmZzZXRzLnB1c2goc25hcE9mZnNldCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChyZWN0ICYmIHJlc3RyaWN0LmVsZW1lbnRSZWN0KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5yZXN0cmljdE9mZnNldC5sZWZ0ID0gdGhpcy5zdGFydE9mZnNldC5sZWZ0IC0gKHdpZHRoICAqIHJlc3RyaWN0LmVsZW1lbnRSZWN0LmxlZnQpO1xuICAgICAgICAgICAgICAgIHRoaXMucmVzdHJpY3RPZmZzZXQudG9wICA9IHRoaXMuc3RhcnRPZmZzZXQudG9wICAtIChoZWlnaHQgKiByZXN0cmljdC5lbGVtZW50UmVjdC50b3ApO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5yZXN0cmljdE9mZnNldC5yaWdodCAgPSB0aGlzLnN0YXJ0T2Zmc2V0LnJpZ2h0ICAtICh3aWR0aCAgKiAoMSAtIHJlc3RyaWN0LmVsZW1lbnRSZWN0LnJpZ2h0KSk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZXN0cmljdE9mZnNldC5ib3R0b20gPSB0aGlzLnN0YXJ0T2Zmc2V0LmJvdHRvbSAtIChoZWlnaHQgKiAoMSAtIHJlc3RyaWN0LmVsZW1lbnRSZWN0LmJvdHRvbSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5yZXN0cmljdE9mZnNldC5sZWZ0ID0gdGhpcy5yZXN0cmljdE9mZnNldC50b3AgPSB0aGlzLnJlc3RyaWN0T2Zmc2V0LnJpZ2h0ID0gdGhpcy5yZXN0cmljdE9mZnNldC5ib3R0b20gPSAwO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIC8qXFxcbiAgICAgICAgICogSW50ZXJhY3Rpb24uc3RhcnRcbiAgICAgICAgIFsgbWV0aG9kIF1cbiAgICAgICAgICpcbiAgICAgICAgICogU3RhcnQgYW4gYWN0aW9uIHdpdGggdGhlIGdpdmVuIEludGVyYWN0YWJsZSBhbmQgRWxlbWVudCBhcyB0YXJ0Z2V0cy4gVGhlXG4gICAgICAgICAqIGFjdGlvbiBtdXN0IGJlIGVuYWJsZWQgZm9yIHRoZSB0YXJnZXQgSW50ZXJhY3RhYmxlIGFuZCBhbiBhcHByb3ByaWF0ZSBudW1iZXJcbiAgICAgICAgICogb2YgcG9pbnRlcnMgbXVzdCBiZSBoZWxkIGRvd24g4oCTIDEgZm9yIGRyYWcvcmVzaXplLCAyIGZvciBnZXN0dXJlLlxuICAgICAgICAgKlxuICAgICAgICAgKiBVc2UgaXQgd2l0aCBgaW50ZXJhY3RhYmxlLjxhY3Rpb24+YWJsZSh7IG1hbnVhbFN0YXJ0OiBmYWxzZSB9KWAgdG8gYWx3YXlzXG4gICAgICAgICAqIFtzdGFydCBhY3Rpb25zIG1hbnVhbGx5XShodHRwczovL2dpdGh1Yi5jb20vdGF5ZS9pbnRlcmFjdC5qcy9pc3N1ZXMvMTE0KVxuICAgICAgICAgKlxuICAgICAgICAgLSBhY3Rpb24gICAgICAgKG9iamVjdCkgIFRoZSBhY3Rpb24gdG8gYmUgcGVyZm9ybWVkIC0gZHJhZywgcmVzaXplLCBldGMuXG4gICAgICAgICAtIGludGVyYWN0YWJsZSAoSW50ZXJhY3RhYmxlKSBUaGUgSW50ZXJhY3RhYmxlIHRvIHRhcmdldFxuICAgICAgICAgLSBlbGVtZW50ICAgICAgKEVsZW1lbnQpIFRoZSBET00gRWxlbWVudCB0byB0YXJnZXRcbiAgICAgICAgID0gKG9iamVjdCkgaW50ZXJhY3RcbiAgICAgICAgICoqXG4gICAgICAgICB8IGludGVyYWN0KHRhcmdldClcbiAgICAgICAgIHwgICAuZHJhZ2dhYmxlKHtcbiAgICAgICAgIHwgICAgIC8vIGRpc2FibGUgdGhlIGRlZmF1bHQgZHJhZyBzdGFydCBieSBkb3duLT5tb3ZlXG4gICAgICAgICB8ICAgICBtYW51YWxTdGFydDogdHJ1ZVxuICAgICAgICAgfCAgIH0pXG4gICAgICAgICB8ICAgLy8gc3RhcnQgZHJhZ2dpbmcgYWZ0ZXIgdGhlIHVzZXIgaG9sZHMgdGhlIHBvaW50ZXIgZG93blxuICAgICAgICAgfCAgIC5vbignaG9sZCcsIGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgfCAgICAgdmFyIGludGVyYWN0aW9uID0gZXZlbnQuaW50ZXJhY3Rpb247XG4gICAgICAgICB8XG4gICAgICAgICB8ICAgICBpZiAoIWludGVyYWN0aW9uLmludGVyYWN0aW5nKCkpIHtcbiAgICAgICAgIHwgICAgICAgaW50ZXJhY3Rpb24uc3RhcnQoeyBuYW1lOiAnZHJhZycgfSxcbiAgICAgICAgIHwgICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnQuaW50ZXJhY3RhYmxlLFxuICAgICAgICAgfCAgICAgICAgICAgICAgICAgICAgICAgICBldmVudC5jdXJyZW50VGFyZ2V0KTtcbiAgICAgICAgIHwgICAgIH1cbiAgICAgICAgIHwgfSk7XG4gICAgICAgIFxcKi9cbiAgICAgICAgc3RhcnQ6IGZ1bmN0aW9uIChhY3Rpb24sIGludGVyYWN0YWJsZSwgZWxlbWVudCkge1xuICAgICAgICAgICAgaWYgKHRoaXMuaW50ZXJhY3RpbmcoKVxuICAgICAgICAgICAgICAgIHx8ICF0aGlzLnBvaW50ZXJJc0Rvd25cbiAgICAgICAgICAgICAgICB8fCB0aGlzLnBvaW50ZXJJZHMubGVuZ3RoIDwgKGFjdGlvbi5uYW1lID09PSAnZ2VzdHVyZSc/IDIgOiAxKSkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gaWYgdGhpcyBpbnRlcmFjdGlvbiBoYWQgYmVlbiByZW1vdmVkIGFmdGVyIHN0b3BwaW5nXG4gICAgICAgICAgICAvLyBhZGQgaXQgYmFja1xuICAgICAgICAgICAgaWYgKGluZGV4T2YoaW50ZXJhY3Rpb25zLCB0aGlzKSA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICBpbnRlcmFjdGlvbnMucHVzaCh0aGlzKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gc2V0IHRoZSBzdGFydENvb3JkcyBpZiB0aGVyZSB3YXMgbm8gcHJlcGFyZWQgYWN0aW9uXG4gICAgICAgICAgICBpZiAoIXRoaXMucHJlcGFyZWQubmFtZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0RXZlbnRYWSh0aGlzLnN0YXJ0Q29vcmRzKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5wcmVwYXJlZC5uYW1lICA9IGFjdGlvbi5uYW1lO1xuICAgICAgICAgICAgdGhpcy5wcmVwYXJlZC5heGlzICA9IGFjdGlvbi5heGlzO1xuICAgICAgICAgICAgdGhpcy5wcmVwYXJlZC5lZGdlcyA9IGFjdGlvbi5lZGdlcztcbiAgICAgICAgICAgIHRoaXMudGFyZ2V0ICAgICAgICAgPSBpbnRlcmFjdGFibGU7XG4gICAgICAgICAgICB0aGlzLmVsZW1lbnQgICAgICAgID0gZWxlbWVudDtcblxuICAgICAgICAgICAgdGhpcy5zZXRTdGFydE9mZnNldHMoYWN0aW9uLm5hbWUsIGludGVyYWN0YWJsZSwgZWxlbWVudCk7XG4gICAgICAgICAgICB0aGlzLnNldE1vZGlmaWNhdGlvbnModGhpcy5zdGFydENvb3Jkcy5wYWdlKTtcblxuICAgICAgICAgICAgdGhpcy5wcmV2RXZlbnQgPSB0aGlzW3RoaXMucHJlcGFyZWQubmFtZSArICdTdGFydCddKHRoaXMuZG93bkV2ZW50KTtcbiAgICAgICAgfSxcblxuICAgICAgICBwb2ludGVyTW92ZTogZnVuY3Rpb24gKHBvaW50ZXIsIGV2ZW50LCBldmVudFRhcmdldCwgY3VyRXZlbnRUYXJnZXQsIHByZUVuZCkge1xuICAgICAgICAgICAgaWYgKHRoaXMuaW5lcnRpYVN0YXR1cy5hY3RpdmUpIHtcbiAgICAgICAgICAgICAgICB2YXIgcGFnZVVwICAgPSB0aGlzLmluZXJ0aWFTdGF0dXMudXBDb29yZHMucGFnZTtcbiAgICAgICAgICAgICAgICB2YXIgY2xpZW50VXAgPSB0aGlzLmluZXJ0aWFTdGF0dXMudXBDb29yZHMuY2xpZW50O1xuXG4gICAgICAgICAgICAgICAgdmFyIGluZXJ0aWFQb3NpdGlvbiA9IHtcbiAgICAgICAgICAgICAgICAgICAgcGFnZVggIDogcGFnZVVwLnggICArIHRoaXMuaW5lcnRpYVN0YXR1cy5zeCxcbiAgICAgICAgICAgICAgICAgICAgcGFnZVkgIDogcGFnZVVwLnkgICArIHRoaXMuaW5lcnRpYVN0YXR1cy5zeSxcbiAgICAgICAgICAgICAgICAgICAgY2xpZW50WDogY2xpZW50VXAueCArIHRoaXMuaW5lcnRpYVN0YXR1cy5zeCxcbiAgICAgICAgICAgICAgICAgICAgY2xpZW50WTogY2xpZW50VXAueSArIHRoaXMuaW5lcnRpYVN0YXR1cy5zeVxuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICB0aGlzLnNldEV2ZW50WFkodGhpcy5jdXJDb29yZHMsIFtpbmVydGlhUG9zaXRpb25dKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMucmVjb3JkUG9pbnRlcihwb2ludGVyKTtcbiAgICAgICAgICAgICAgICB0aGlzLnNldEV2ZW50WFkodGhpcy5jdXJDb29yZHMsIHRoaXMucG9pbnRlcnMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgZHVwbGljYXRlTW92ZSA9ICh0aGlzLmN1ckNvb3Jkcy5wYWdlLnggPT09IHRoaXMucHJldkNvb3Jkcy5wYWdlLnhcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICYmIHRoaXMuY3VyQ29vcmRzLnBhZ2UueSA9PT0gdGhpcy5wcmV2Q29vcmRzLnBhZ2UueVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJiYgdGhpcy5jdXJDb29yZHMuY2xpZW50LnggPT09IHRoaXMucHJldkNvb3Jkcy5jbGllbnQueFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJiYgdGhpcy5jdXJDb29yZHMuY2xpZW50LnkgPT09IHRoaXMucHJldkNvb3Jkcy5jbGllbnQueSk7XG5cbiAgICAgICAgICAgIHZhciBkeCwgZHksXG4gICAgICAgICAgICAgICAgcG9pbnRlckluZGV4ID0gdGhpcy5tb3VzZT8gMCA6IGluZGV4T2YodGhpcy5wb2ludGVySWRzLCBnZXRQb2ludGVySWQocG9pbnRlcikpO1xuXG4gICAgICAgICAgICAvLyByZWdpc3RlciBtb3ZlbWVudCBncmVhdGVyIHRoYW4gcG9pbnRlck1vdmVUb2xlcmFuY2VcbiAgICAgICAgICAgIGlmICh0aGlzLnBvaW50ZXJJc0Rvd24gJiYgIXRoaXMucG9pbnRlcldhc01vdmVkKSB7XG4gICAgICAgICAgICAgICAgZHggPSB0aGlzLmN1ckNvb3Jkcy5jbGllbnQueCAtIHRoaXMuc3RhcnRDb29yZHMuY2xpZW50Lng7XG4gICAgICAgICAgICAgICAgZHkgPSB0aGlzLmN1ckNvb3Jkcy5jbGllbnQueSAtIHRoaXMuc3RhcnRDb29yZHMuY2xpZW50Lnk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLnBvaW50ZXJXYXNNb3ZlZCA9IGh5cG90KGR4LCBkeSkgPiBwb2ludGVyTW92ZVRvbGVyYW5jZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCFkdXBsaWNhdGVNb3ZlICYmICghdGhpcy5wb2ludGVySXNEb3duIHx8IHRoaXMucG9pbnRlcldhc01vdmVkKSkge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLnBvaW50ZXJJc0Rvd24pIHtcbiAgICAgICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuaG9sZFRpbWVyc1twb2ludGVySW5kZXhdKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0aGlzLmNvbGxlY3RFdmVudFRhcmdldHMocG9pbnRlciwgZXZlbnQsIGV2ZW50VGFyZ2V0LCAnbW92ZScpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIXRoaXMucG9pbnRlcklzRG93bikgeyByZXR1cm47IH1cblxuICAgICAgICAgICAgaWYgKGR1cGxpY2F0ZU1vdmUgJiYgdGhpcy5wb2ludGVyV2FzTW92ZWQgJiYgIXByZUVuZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2hlY2tBbmRQcmV2ZW50RGVmYXVsdChldmVudCwgdGhpcy50YXJnZXQsIHRoaXMuZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBzZXQgcG9pbnRlciBjb29yZGluYXRlLCB0aW1lIGNoYW5nZXMgYW5kIHNwZWVkc1xuICAgICAgICAgICAgc2V0RXZlbnREZWx0YXModGhpcy5wb2ludGVyRGVsdGEsIHRoaXMucHJldkNvb3JkcywgdGhpcy5jdXJDb29yZHMpO1xuXG4gICAgICAgICAgICBpZiAoIXRoaXMucHJlcGFyZWQubmFtZSkgeyByZXR1cm47IH1cblxuICAgICAgICAgICAgaWYgKHRoaXMucG9pbnRlcldhc01vdmVkXG4gICAgICAgICAgICAgICAgLy8gaWdub3JlIG1vdmVtZW50IHdoaWxlIGluZXJ0aWEgaXMgYWN0aXZlXG4gICAgICAgICAgICAgICAgJiYgKCF0aGlzLmluZXJ0aWFTdGF0dXMuYWN0aXZlIHx8IChwb2ludGVyIGluc3RhbmNlb2YgSW50ZXJhY3RFdmVudCAmJiAvaW5lcnRpYXN0YXJ0Ly50ZXN0KHBvaW50ZXIudHlwZSkpKSkge1xuXG4gICAgICAgICAgICAgICAgLy8gaWYganVzdCBzdGFydGluZyBhbiBhY3Rpb24sIGNhbGN1bGF0ZSB0aGUgcG9pbnRlciBzcGVlZCBub3dcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMuaW50ZXJhY3RpbmcoKSkge1xuICAgICAgICAgICAgICAgICAgICBzZXRFdmVudERlbHRhcyh0aGlzLnBvaW50ZXJEZWx0YSwgdGhpcy5wcmV2Q29vcmRzLCB0aGlzLmN1ckNvb3Jkcyk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gY2hlY2sgaWYgYSBkcmFnIGlzIGluIHRoZSBjb3JyZWN0IGF4aXNcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMucHJlcGFyZWQubmFtZSA9PT0gJ2RyYWcnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgYWJzWCA9IE1hdGguYWJzKGR4KSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhYnNZID0gTWF0aC5hYnMoZHkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldEF4aXMgPSB0aGlzLnRhcmdldC5vcHRpb25zLmRyYWcuYXhpcyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBheGlzID0gKGFic1ggPiBhYnNZID8gJ3gnIDogYWJzWCA8IGFic1kgPyAneScgOiAneHknKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWYgdGhlIG1vdmVtZW50IGlzbid0IGluIHRoZSBheGlzIG9mIHRoZSBpbnRlcmFjdGFibGVcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChheGlzICE9PSAneHknICYmIHRhcmdldEF4aXMgIT09ICd4eScgJiYgdGFyZ2V0QXhpcyAhPT0gYXhpcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGNhbmNlbCB0aGUgcHJlcGFyZWQgYWN0aW9uXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wcmVwYXJlZC5uYW1lID0gbnVsbDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoZW4gdHJ5IHRvIGdldCBhIGRyYWcgZnJvbSBhbm90aGVyIGluZXJhY3RhYmxlXG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgZWxlbWVudCA9IGV2ZW50VGFyZ2V0O1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gY2hlY2sgZWxlbWVudCBpbnRlcmFjdGFibGVzXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgd2hpbGUgKGlzRWxlbWVudChlbGVtZW50KSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgZWxlbWVudEludGVyYWN0YWJsZSA9IGludGVyYWN0YWJsZXMuZ2V0KGVsZW1lbnQpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChlbGVtZW50SW50ZXJhY3RhYmxlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAmJiBlbGVtZW50SW50ZXJhY3RhYmxlICE9PSB0aGlzLnRhcmdldFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJiYgIWVsZW1lbnRJbnRlcmFjdGFibGUub3B0aW9ucy5kcmFnLm1hbnVhbFN0YXJ0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAmJiBlbGVtZW50SW50ZXJhY3RhYmxlLmdldEFjdGlvbih0aGlzLmRvd25Qb2ludGVyLCB0aGlzLmRvd25FdmVudCwgdGhpcywgZWxlbWVudCkubmFtZSA9PT0gJ2RyYWcnXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAmJiBjaGVja0F4aXMoYXhpcywgZWxlbWVudEludGVyYWN0YWJsZSkpIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wcmVwYXJlZC5uYW1lID0gJ2RyYWcnO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy50YXJnZXQgPSBlbGVtZW50SW50ZXJhY3RhYmxlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbGVtZW50ID0gZWxlbWVudDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudCA9IHBhcmVudEVsZW1lbnQoZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWYgdGhlcmUncyBubyBkcmFnIGZyb20gZWxlbWVudCBpbnRlcmFjdGFibGVzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGNoZWNrIHRoZSBzZWxlY3RvciBpbnRlcmFjdGFibGVzXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCF0aGlzLnByZXBhcmVkLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHRoaXNJbnRlcmFjdGlvbiA9IHRoaXM7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGdldERyYWdnYWJsZSA9IGZ1bmN0aW9uIChpbnRlcmFjdGFibGUsIHNlbGVjdG9yLCBjb250ZXh0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgZWxlbWVudHMgPSBpZThNYXRjaGVzU2VsZWN0b3JcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA/IGNvbnRleHQucXVlcnlTZWxlY3RvckFsbChzZWxlY3RvcilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA6IHVuZGVmaW5lZDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGludGVyYWN0YWJsZSA9PT0gdGhpc0ludGVyYWN0aW9uLnRhcmdldCkgeyByZXR1cm47IH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGluQ29udGV4dChpbnRlcmFjdGFibGUsIGV2ZW50VGFyZ2V0KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICYmICFpbnRlcmFjdGFibGUub3B0aW9ucy5kcmFnLm1hbnVhbFN0YXJ0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJiYgIXRlc3RJZ25vcmUoaW50ZXJhY3RhYmxlLCBlbGVtZW50LCBldmVudFRhcmdldClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAmJiB0ZXN0QWxsb3coaW50ZXJhY3RhYmxlLCBlbGVtZW50LCBldmVudFRhcmdldClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAmJiBtYXRjaGVzU2VsZWN0b3IoZWxlbWVudCwgc2VsZWN0b3IsIGVsZW1lbnRzKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICYmIGludGVyYWN0YWJsZS5nZXRBY3Rpb24odGhpc0ludGVyYWN0aW9uLmRvd25Qb2ludGVyLCB0aGlzSW50ZXJhY3Rpb24uZG93bkV2ZW50LCB0aGlzSW50ZXJhY3Rpb24sIGVsZW1lbnQpLm5hbWUgPT09ICdkcmFnJ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICYmIGNoZWNrQXhpcyhheGlzLCBpbnRlcmFjdGFibGUpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJiYgd2l0aGluSW50ZXJhY3Rpb25MaW1pdChpbnRlcmFjdGFibGUsIGVsZW1lbnQsICdkcmFnJykpIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBpbnRlcmFjdGFibGU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudCA9IGV2ZW50VGFyZ2V0O1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdoaWxlIChpc0VsZW1lbnQoZWxlbWVudCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBzZWxlY3RvckludGVyYWN0YWJsZSA9IGludGVyYWN0YWJsZXMuZm9yRWFjaFNlbGVjdG9yKGdldERyYWdnYWJsZSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzZWxlY3RvckludGVyYWN0YWJsZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucHJlcGFyZWQubmFtZSA9ICdkcmFnJztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnRhcmdldCA9IHNlbGVjdG9ySW50ZXJhY3RhYmxlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZWxlbWVudCA9IGVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnQgPSBwYXJlbnRFbGVtZW50KGVsZW1lbnQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdmFyIHN0YXJ0aW5nID0gISF0aGlzLnByZXBhcmVkLm5hbWUgJiYgIXRoaXMuaW50ZXJhY3RpbmcoKTtcblxuICAgICAgICAgICAgICAgIGlmIChzdGFydGluZ1xuICAgICAgICAgICAgICAgICAgICAmJiAodGhpcy50YXJnZXQub3B0aW9uc1t0aGlzLnByZXBhcmVkLm5hbWVdLm1hbnVhbFN0YXJ0XG4gICAgICAgICAgICAgICAgICAgICAgICB8fCAhd2l0aGluSW50ZXJhY3Rpb25MaW1pdCh0aGlzLnRhcmdldCwgdGhpcy5lbGVtZW50LCB0aGlzLnByZXBhcmVkKSkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zdG9wKGV2ZW50KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnByZXBhcmVkLm5hbWUgJiYgdGhpcy50YXJnZXQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXJ0aW5nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnN0YXJ0KHRoaXMucHJlcGFyZWQsIHRoaXMudGFyZ2V0LCB0aGlzLmVsZW1lbnQpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgdmFyIHNob3VsZE1vdmUgPSB0aGlzLnNldE1vZGlmaWNhdGlvbnModGhpcy5jdXJDb29yZHMucGFnZSwgcHJlRW5kKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBtb3ZlIGlmIHNuYXBwaW5nIG9yIHJlc3RyaWN0aW9uIGRvZXNuJ3QgcHJldmVudCBpdFxuICAgICAgICAgICAgICAgICAgICBpZiAoc2hvdWxkTW92ZSB8fCBzdGFydGluZykge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wcmV2RXZlbnQgPSB0aGlzW3RoaXMucHJlcGFyZWQubmFtZSArICdNb3ZlJ10oZXZlbnQpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jaGVja0FuZFByZXZlbnREZWZhdWx0KGV2ZW50LCB0aGlzLnRhcmdldCwgdGhpcy5lbGVtZW50KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvcHlDb29yZHModGhpcy5wcmV2Q29vcmRzLCB0aGlzLmN1ckNvb3Jkcyk7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLmRyYWdnaW5nIHx8IHRoaXMucmVzaXppbmcpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmF1dG9TY3JvbGxNb3ZlKHBvaW50ZXIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIGRyYWdTdGFydDogZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICB2YXIgZHJhZ0V2ZW50ID0gbmV3IEludGVyYWN0RXZlbnQodGhpcywgZXZlbnQsICdkcmFnJywgJ3N0YXJ0JywgdGhpcy5lbGVtZW50KTtcblxuICAgICAgICAgICAgdGhpcy5kcmFnZ2luZyA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLnRhcmdldC5maXJlKGRyYWdFdmVudCk7XG5cbiAgICAgICAgICAgIC8vIHJlc2V0IGFjdGl2ZSBkcm9wem9uZXNcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlRHJvcHMuZHJvcHpvbmVzID0gW107XG4gICAgICAgICAgICB0aGlzLmFjdGl2ZURyb3BzLmVsZW1lbnRzICA9IFtdO1xuICAgICAgICAgICAgdGhpcy5hY3RpdmVEcm9wcy5yZWN0cyAgICAgPSBbXTtcblxuICAgICAgICAgICAgaWYgKCF0aGlzLmR5bmFtaWNEcm9wKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRBY3RpdmVEcm9wcyh0aGlzLmVsZW1lbnQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgZHJvcEV2ZW50cyA9IHRoaXMuZ2V0RHJvcEV2ZW50cyhldmVudCwgZHJhZ0V2ZW50KTtcblxuICAgICAgICAgICAgaWYgKGRyb3BFdmVudHMuYWN0aXZhdGUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmZpcmVBY3RpdmVEcm9wcyhkcm9wRXZlbnRzLmFjdGl2YXRlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGRyYWdFdmVudDtcbiAgICAgICAgfSxcblxuICAgICAgICBkcmFnTW92ZTogZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICB2YXIgdGFyZ2V0ID0gdGhpcy50YXJnZXQsXG4gICAgICAgICAgICAgICAgZHJhZ0V2ZW50ICA9IG5ldyBJbnRlcmFjdEV2ZW50KHRoaXMsIGV2ZW50LCAnZHJhZycsICdtb3ZlJywgdGhpcy5lbGVtZW50KSxcbiAgICAgICAgICAgICAgICBkcmFnZ2FibGVFbGVtZW50ID0gdGhpcy5lbGVtZW50LFxuICAgICAgICAgICAgICAgIGRyb3AgPSB0aGlzLmdldERyb3AoZHJhZ0V2ZW50LCBldmVudCwgZHJhZ2dhYmxlRWxlbWVudCk7XG5cbiAgICAgICAgICAgIHRoaXMuZHJvcFRhcmdldCA9IGRyb3AuZHJvcHpvbmU7XG4gICAgICAgICAgICB0aGlzLmRyb3BFbGVtZW50ID0gZHJvcC5lbGVtZW50O1xuXG4gICAgICAgICAgICB2YXIgZHJvcEV2ZW50cyA9IHRoaXMuZ2V0RHJvcEV2ZW50cyhldmVudCwgZHJhZ0V2ZW50KTtcblxuICAgICAgICAgICAgdGFyZ2V0LmZpcmUoZHJhZ0V2ZW50KTtcblxuICAgICAgICAgICAgaWYgKGRyb3BFdmVudHMubGVhdmUpIHsgdGhpcy5wcmV2RHJvcFRhcmdldC5maXJlKGRyb3BFdmVudHMubGVhdmUpOyB9XG4gICAgICAgICAgICBpZiAoZHJvcEV2ZW50cy5lbnRlcikgeyAgICAgdGhpcy5kcm9wVGFyZ2V0LmZpcmUoZHJvcEV2ZW50cy5lbnRlcik7IH1cbiAgICAgICAgICAgIGlmIChkcm9wRXZlbnRzLm1vdmUgKSB7ICAgICB0aGlzLmRyb3BUYXJnZXQuZmlyZShkcm9wRXZlbnRzLm1vdmUgKTsgfVxuXG4gICAgICAgICAgICB0aGlzLnByZXZEcm9wVGFyZ2V0ICA9IHRoaXMuZHJvcFRhcmdldDtcbiAgICAgICAgICAgIHRoaXMucHJldkRyb3BFbGVtZW50ID0gdGhpcy5kcm9wRWxlbWVudDtcblxuICAgICAgICAgICAgcmV0dXJuIGRyYWdFdmVudDtcbiAgICAgICAgfSxcblxuICAgICAgICByZXNpemVTdGFydDogZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICB2YXIgcmVzaXplRXZlbnQgPSBuZXcgSW50ZXJhY3RFdmVudCh0aGlzLCBldmVudCwgJ3Jlc2l6ZScsICdzdGFydCcsIHRoaXMuZWxlbWVudCk7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLnByZXBhcmVkLmVkZ2VzKSB7XG4gICAgICAgICAgICAgICAgdmFyIHN0YXJ0UmVjdCA9IHRoaXMudGFyZ2V0LmdldFJlY3QodGhpcy5lbGVtZW50KTtcblxuICAgICAgICAgICAgICAgIC8qXG4gICAgICAgICAgICAgICAgICogV2hlbiB1c2luZyB0aGUgYHJlc2l6YWJsZS5zcXVhcmVgIG9yIGByZXNpemFibGUucHJlc2VydmVBc3BlY3RSYXRpb2Agb3B0aW9ucywgcmVzaXppbmcgZnJvbSBvbmUgZWRnZVxuICAgICAgICAgICAgICAgICAqIHdpbGwgYWZmZWN0IGFub3RoZXIuIEUuZy4gd2l0aCBgcmVzaXphYmxlLnNxdWFyZWAsIHJlc2l6aW5nIHRvIG1ha2UgdGhlIHJpZ2h0IGVkZ2UgbGFyZ2VyIHdpbGwgbWFrZVxuICAgICAgICAgICAgICAgICAqIHRoZSBib3R0b20gZWRnZSBsYXJnZXIgYnkgdGhlIHNhbWUgYW1vdW50LiBXZSBjYWxsIHRoZXNlICdsaW5rZWQnIGVkZ2VzLiBBbnkgbGlua2VkIGVkZ2VzIHdpbGwgZGVwZW5kXG4gICAgICAgICAgICAgICAgICogb24gdGhlIGFjdGl2ZSBlZGdlcyBhbmQgdGhlIGVkZ2UgYmVpbmcgaW50ZXJhY3RlZCB3aXRoLlxuICAgICAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLnRhcmdldC5vcHRpb25zLnJlc2l6ZS5zcXVhcmUgfHwgdGhpcy50YXJnZXQub3B0aW9ucy5yZXNpemUucHJlc2VydmVBc3BlY3RSYXRpbykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgbGlua2VkRWRnZXMgPSBleHRlbmQoe30sIHRoaXMucHJlcGFyZWQuZWRnZXMpO1xuXG4gICAgICAgICAgICAgICAgICAgIGxpbmtlZEVkZ2VzLnRvcCAgICA9IGxpbmtlZEVkZ2VzLnRvcCAgICB8fCAobGlua2VkRWRnZXMubGVmdCAgICYmICFsaW5rZWRFZGdlcy5ib3R0b20pO1xuICAgICAgICAgICAgICAgICAgICBsaW5rZWRFZGdlcy5sZWZ0ICAgPSBsaW5rZWRFZGdlcy5sZWZ0ICAgfHwgKGxpbmtlZEVkZ2VzLnRvcCAgICAmJiAhbGlua2VkRWRnZXMucmlnaHQgKTtcbiAgICAgICAgICAgICAgICAgICAgbGlua2VkRWRnZXMuYm90dG9tID0gbGlua2VkRWRnZXMuYm90dG9tIHx8IChsaW5rZWRFZGdlcy5yaWdodCAgJiYgIWxpbmtlZEVkZ2VzLnRvcCAgICk7XG4gICAgICAgICAgICAgICAgICAgIGxpbmtlZEVkZ2VzLnJpZ2h0ICA9IGxpbmtlZEVkZ2VzLnJpZ2h0ICB8fCAobGlua2VkRWRnZXMuYm90dG9tICYmICFsaW5rZWRFZGdlcy5sZWZ0ICApO1xuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucHJlcGFyZWQuX2xpbmtlZEVkZ2VzID0gbGlua2VkRWRnZXM7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnByZXBhcmVkLl9saW5rZWRFZGdlcyA9IG51bGw7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gaWYgdXNpbmcgYHJlc2l6YWJsZS5wcmVzZXJ2ZUFzcGVjdFJhdGlvYCBvcHRpb24sIHJlY29yZCBhc3BlY3QgcmF0aW8gYXQgdGhlIHN0YXJ0IG9mIHRoZSByZXNpemVcbiAgICAgICAgICAgICAgICBpZiAodGhpcy50YXJnZXQub3B0aW9ucy5yZXNpemUucHJlc2VydmVBc3BlY3RSYXRpbykge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnJlc2l6ZVN0YXJ0QXNwZWN0UmF0aW8gPSBzdGFydFJlY3Qud2lkdGggLyBzdGFydFJlY3QuaGVpZ2h0O1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRoaXMucmVzaXplUmVjdHMgPSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXJ0ICAgICA6IHN0YXJ0UmVjdCxcbiAgICAgICAgICAgICAgICAgICAgY3VycmVudCAgIDogZXh0ZW5kKHt9LCBzdGFydFJlY3QpLFxuICAgICAgICAgICAgICAgICAgICByZXN0cmljdGVkOiBleHRlbmQoe30sIHN0YXJ0UmVjdCksXG4gICAgICAgICAgICAgICAgICAgIHByZXZpb3VzICA6IGV4dGVuZCh7fSwgc3RhcnRSZWN0KSxcbiAgICAgICAgICAgICAgICAgICAgZGVsdGEgICAgIDoge1xuICAgICAgICAgICAgICAgICAgICAgICAgbGVmdDogMCwgcmlnaHQgOiAwLCB3aWR0aCA6IDAsXG4gICAgICAgICAgICAgICAgICAgICAgICB0b3AgOiAwLCBib3R0b206IDAsIGhlaWdodDogMFxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIHJlc2l6ZUV2ZW50LnJlY3QgPSB0aGlzLnJlc2l6ZVJlY3RzLnJlc3RyaWN0ZWQ7XG4gICAgICAgICAgICAgICAgcmVzaXplRXZlbnQuZGVsdGFSZWN0ID0gdGhpcy5yZXNpemVSZWN0cy5kZWx0YTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy50YXJnZXQuZmlyZShyZXNpemVFdmVudCk7XG5cbiAgICAgICAgICAgIHRoaXMucmVzaXppbmcgPSB0cnVlO1xuXG4gICAgICAgICAgICByZXR1cm4gcmVzaXplRXZlbnQ7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcmVzaXplTW92ZTogZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICB2YXIgcmVzaXplRXZlbnQgPSBuZXcgSW50ZXJhY3RFdmVudCh0aGlzLCBldmVudCwgJ3Jlc2l6ZScsICdtb3ZlJywgdGhpcy5lbGVtZW50KTtcblxuICAgICAgICAgICAgdmFyIGVkZ2VzID0gdGhpcy5wcmVwYXJlZC5lZGdlcyxcbiAgICAgICAgICAgICAgICBpbnZlcnQgPSB0aGlzLnRhcmdldC5vcHRpb25zLnJlc2l6ZS5pbnZlcnQsXG4gICAgICAgICAgICAgICAgaW52ZXJ0aWJsZSA9IGludmVydCA9PT0gJ3JlcG9zaXRpb24nIHx8IGludmVydCA9PT0gJ25lZ2F0ZSc7XG5cbiAgICAgICAgICAgIGlmIChlZGdlcykge1xuICAgICAgICAgICAgICAgIHZhciBkeCA9IHJlc2l6ZUV2ZW50LmR4LFxuICAgICAgICAgICAgICAgICAgICBkeSA9IHJlc2l6ZUV2ZW50LmR5LFxuXG4gICAgICAgICAgICAgICAgICAgIHN0YXJ0ICAgICAgPSB0aGlzLnJlc2l6ZVJlY3RzLnN0YXJ0LFxuICAgICAgICAgICAgICAgICAgICBjdXJyZW50ICAgID0gdGhpcy5yZXNpemVSZWN0cy5jdXJyZW50LFxuICAgICAgICAgICAgICAgICAgICByZXN0cmljdGVkID0gdGhpcy5yZXNpemVSZWN0cy5yZXN0cmljdGVkLFxuICAgICAgICAgICAgICAgICAgICBkZWx0YSAgICAgID0gdGhpcy5yZXNpemVSZWN0cy5kZWx0YSxcbiAgICAgICAgICAgICAgICAgICAgcHJldmlvdXMgICA9IGV4dGVuZCh0aGlzLnJlc2l6ZVJlY3RzLnByZXZpb3VzLCByZXN0cmljdGVkKSxcblxuICAgICAgICAgICAgICAgICAgICBvcmlnaW5hbEVkZ2VzID0gZWRnZXM7XG5cbiAgICAgICAgICAgICAgICAvLyBgcmVzaXplLnByZXNlcnZlQXNwZWN0UmF0aW9gIHRha2VzIHByZWNlZGVuY2Ugb3ZlciBgcmVzaXplLnNxdWFyZWBcbiAgICAgICAgICAgICAgICBpZiAodGhpcy50YXJnZXQub3B0aW9ucy5yZXNpemUucHJlc2VydmVBc3BlY3RSYXRpbykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgcmVzaXplU3RhcnRBc3BlY3RSYXRpbyA9IHRoaXMucmVzaXplU3RhcnRBc3BlY3RSYXRpbztcblxuICAgICAgICAgICAgICAgICAgICBlZGdlcyA9IHRoaXMucHJlcGFyZWQuX2xpbmtlZEVkZ2VzO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmICgob3JpZ2luYWxFZGdlcy5sZWZ0ICYmIG9yaWdpbmFsRWRnZXMuYm90dG9tKVxuICAgICAgICAgICAgICAgICAgICAgICAgfHwgKG9yaWdpbmFsRWRnZXMucmlnaHQgJiYgb3JpZ2luYWxFZGdlcy50b3ApKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkeSA9IC1keCAvIHJlc2l6ZVN0YXJ0QXNwZWN0UmF0aW87XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAob3JpZ2luYWxFZGdlcy5sZWZ0IHx8IG9yaWdpbmFsRWRnZXMucmlnaHQpIHsgZHkgPSBkeCAvIHJlc2l6ZVN0YXJ0QXNwZWN0UmF0aW87IH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAob3JpZ2luYWxFZGdlcy50b3AgfHwgb3JpZ2luYWxFZGdlcy5ib3R0b20pIHsgZHggPSBkeSAqIHJlc2l6ZVN0YXJ0QXNwZWN0UmF0aW87IH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAodGhpcy50YXJnZXQub3B0aW9ucy5yZXNpemUuc3F1YXJlKSB7XG4gICAgICAgICAgICAgICAgICAgIGVkZ2VzID0gdGhpcy5wcmVwYXJlZC5fbGlua2VkRWRnZXM7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKChvcmlnaW5hbEVkZ2VzLmxlZnQgJiYgb3JpZ2luYWxFZGdlcy5ib3R0b20pXG4gICAgICAgICAgICAgICAgICAgICAgICB8fCAob3JpZ2luYWxFZGdlcy5yaWdodCAmJiBvcmlnaW5hbEVkZ2VzLnRvcCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGR5ID0gLWR4O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKG9yaWdpbmFsRWRnZXMubGVmdCB8fCBvcmlnaW5hbEVkZ2VzLnJpZ2h0KSB7IGR5ID0gZHg7IH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAob3JpZ2luYWxFZGdlcy50b3AgfHwgb3JpZ2luYWxFZGdlcy5ib3R0b20pIHsgZHggPSBkeTsgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIHVwZGF0ZSB0aGUgJ2N1cnJlbnQnIHJlY3Qgd2l0aG91dCBtb2RpZmljYXRpb25zXG4gICAgICAgICAgICAgICAgaWYgKGVkZ2VzLnRvcCAgICkgeyBjdXJyZW50LnRvcCAgICArPSBkeTsgfVxuICAgICAgICAgICAgICAgIGlmIChlZGdlcy5ib3R0b20pIHsgY3VycmVudC5ib3R0b20gKz0gZHk7IH1cbiAgICAgICAgICAgICAgICBpZiAoZWRnZXMubGVmdCAgKSB7IGN1cnJlbnQubGVmdCAgICs9IGR4OyB9XG4gICAgICAgICAgICAgICAgaWYgKGVkZ2VzLnJpZ2h0ICkgeyBjdXJyZW50LnJpZ2h0ICArPSBkeDsgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGludmVydGlibGUpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gaWYgaW52ZXJ0aWJsZSwgY29weSB0aGUgY3VycmVudCByZWN0XG4gICAgICAgICAgICAgICAgICAgIGV4dGVuZChyZXN0cmljdGVkLCBjdXJyZW50KTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoaW52ZXJ0ID09PSAncmVwb3NpdGlvbicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHN3YXAgZWRnZSB2YWx1ZXMgaWYgbmVjZXNzYXJ5IHRvIGtlZXAgd2lkdGgvaGVpZ2h0IHBvc2l0aXZlXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgc3dhcDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3RyaWN0ZWQudG9wID4gcmVzdHJpY3RlZC5ib3R0b20pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzd2FwID0gcmVzdHJpY3RlZC50b3A7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXN0cmljdGVkLnRvcCA9IHJlc3RyaWN0ZWQuYm90dG9tO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3RyaWN0ZWQuYm90dG9tID0gc3dhcDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZXN0cmljdGVkLmxlZnQgPiByZXN0cmljdGVkLnJpZ2h0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3dhcCA9IHJlc3RyaWN0ZWQubGVmdDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3RyaWN0ZWQubGVmdCA9IHJlc3RyaWN0ZWQucmlnaHQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzdHJpY3RlZC5yaWdodCA9IHN3YXA7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGlmIG5vdCBpbnZlcnRpYmxlLCByZXN0cmljdCB0byBtaW5pbXVtIG9mIDB4MCByZWN0XG4gICAgICAgICAgICAgICAgICAgIHJlc3RyaWN0ZWQudG9wICAgID0gTWF0aC5taW4oY3VycmVudC50b3AsIHN0YXJ0LmJvdHRvbSk7XG4gICAgICAgICAgICAgICAgICAgIHJlc3RyaWN0ZWQuYm90dG9tID0gTWF0aC5tYXgoY3VycmVudC5ib3R0b20sIHN0YXJ0LnRvcCk7XG4gICAgICAgICAgICAgICAgICAgIHJlc3RyaWN0ZWQubGVmdCAgID0gTWF0aC5taW4oY3VycmVudC5sZWZ0LCBzdGFydC5yaWdodCk7XG4gICAgICAgICAgICAgICAgICAgIHJlc3RyaWN0ZWQucmlnaHQgID0gTWF0aC5tYXgoY3VycmVudC5yaWdodCwgc3RhcnQubGVmdCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmVzdHJpY3RlZC53aWR0aCAgPSByZXN0cmljdGVkLnJpZ2h0ICAtIHJlc3RyaWN0ZWQubGVmdDtcbiAgICAgICAgICAgICAgICByZXN0cmljdGVkLmhlaWdodCA9IHJlc3RyaWN0ZWQuYm90dG9tIC0gcmVzdHJpY3RlZC50b3AgO1xuXG4gICAgICAgICAgICAgICAgZm9yICh2YXIgZWRnZSBpbiByZXN0cmljdGVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlbHRhW2VkZ2VdID0gcmVzdHJpY3RlZFtlZGdlXSAtIHByZXZpb3VzW2VkZ2VdO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJlc2l6ZUV2ZW50LmVkZ2VzID0gdGhpcy5wcmVwYXJlZC5lZGdlcztcbiAgICAgICAgICAgICAgICByZXNpemVFdmVudC5yZWN0ID0gcmVzdHJpY3RlZDtcbiAgICAgICAgICAgICAgICByZXNpemVFdmVudC5kZWx0YVJlY3QgPSBkZWx0YTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy50YXJnZXQuZmlyZShyZXNpemVFdmVudCk7XG5cbiAgICAgICAgICAgIHJldHVybiByZXNpemVFdmVudDtcbiAgICAgICAgfSxcblxuICAgICAgICBnZXN0dXJlU3RhcnQ6IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgdmFyIGdlc3R1cmVFdmVudCA9IG5ldyBJbnRlcmFjdEV2ZW50KHRoaXMsIGV2ZW50LCAnZ2VzdHVyZScsICdzdGFydCcsIHRoaXMuZWxlbWVudCk7XG5cbiAgICAgICAgICAgIGdlc3R1cmVFdmVudC5kcyA9IDA7XG5cbiAgICAgICAgICAgIHRoaXMuZ2VzdHVyZS5zdGFydERpc3RhbmNlID0gdGhpcy5nZXN0dXJlLnByZXZEaXN0YW5jZSA9IGdlc3R1cmVFdmVudC5kaXN0YW5jZTtcbiAgICAgICAgICAgIHRoaXMuZ2VzdHVyZS5zdGFydEFuZ2xlID0gdGhpcy5nZXN0dXJlLnByZXZBbmdsZSA9IGdlc3R1cmVFdmVudC5hbmdsZTtcbiAgICAgICAgICAgIHRoaXMuZ2VzdHVyZS5zY2FsZSA9IDE7XG5cbiAgICAgICAgICAgIHRoaXMuZ2VzdHVyaW5nID0gdHJ1ZTtcblxuICAgICAgICAgICAgdGhpcy50YXJnZXQuZmlyZShnZXN0dXJlRXZlbnQpO1xuXG4gICAgICAgICAgICByZXR1cm4gZ2VzdHVyZUV2ZW50O1xuICAgICAgICB9LFxuXG4gICAgICAgIGdlc3R1cmVNb3ZlOiBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgIGlmICghdGhpcy5wb2ludGVySWRzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnByZXZFdmVudDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGdlc3R1cmVFdmVudDtcblxuICAgICAgICAgICAgZ2VzdHVyZUV2ZW50ID0gbmV3IEludGVyYWN0RXZlbnQodGhpcywgZXZlbnQsICdnZXN0dXJlJywgJ21vdmUnLCB0aGlzLmVsZW1lbnQpO1xuICAgICAgICAgICAgZ2VzdHVyZUV2ZW50LmRzID0gZ2VzdHVyZUV2ZW50LnNjYWxlIC0gdGhpcy5nZXN0dXJlLnNjYWxlO1xuXG4gICAgICAgICAgICB0aGlzLnRhcmdldC5maXJlKGdlc3R1cmVFdmVudCk7XG5cbiAgICAgICAgICAgIHRoaXMuZ2VzdHVyZS5wcmV2QW5nbGUgPSBnZXN0dXJlRXZlbnQuYW5nbGU7XG4gICAgICAgICAgICB0aGlzLmdlc3R1cmUucHJldkRpc3RhbmNlID0gZ2VzdHVyZUV2ZW50LmRpc3RhbmNlO1xuXG4gICAgICAgICAgICBpZiAoZ2VzdHVyZUV2ZW50LnNjYWxlICE9PSBJbmZpbml0eSAmJlxuICAgICAgICAgICAgICAgIGdlc3R1cmVFdmVudC5zY2FsZSAhPT0gbnVsbCAmJlxuICAgICAgICAgICAgICAgIGdlc3R1cmVFdmVudC5zY2FsZSAhPT0gdW5kZWZpbmVkICAmJlxuICAgICAgICAgICAgICAgICFpc05hTihnZXN0dXJlRXZlbnQuc2NhbGUpKSB7XG5cbiAgICAgICAgICAgICAgICB0aGlzLmdlc3R1cmUuc2NhbGUgPSBnZXN0dXJlRXZlbnQuc2NhbGU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBnZXN0dXJlRXZlbnQ7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcG9pbnRlckhvbGQ6IGZ1bmN0aW9uIChwb2ludGVyLCBldmVudCwgZXZlbnRUYXJnZXQpIHtcbiAgICAgICAgICAgIHRoaXMuY29sbGVjdEV2ZW50VGFyZ2V0cyhwb2ludGVyLCBldmVudCwgZXZlbnRUYXJnZXQsICdob2xkJyk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcG9pbnRlclVwOiBmdW5jdGlvbiAocG9pbnRlciwgZXZlbnQsIGV2ZW50VGFyZ2V0LCBjdXJFdmVudFRhcmdldCkge1xuICAgICAgICAgICAgdmFyIHBvaW50ZXJJbmRleCA9IHRoaXMubW91c2U/IDAgOiBpbmRleE9mKHRoaXMucG9pbnRlcklkcywgZ2V0UG9pbnRlcklkKHBvaW50ZXIpKTtcblxuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuaG9sZFRpbWVyc1twb2ludGVySW5kZXhdKTtcblxuICAgICAgICAgICAgdGhpcy5jb2xsZWN0RXZlbnRUYXJnZXRzKHBvaW50ZXIsIGV2ZW50LCBldmVudFRhcmdldCwgJ3VwJyApO1xuICAgICAgICAgICAgdGhpcy5jb2xsZWN0RXZlbnRUYXJnZXRzKHBvaW50ZXIsIGV2ZW50LCBldmVudFRhcmdldCwgJ3RhcCcpO1xuXG4gICAgICAgICAgICB0aGlzLnBvaW50ZXJFbmQocG9pbnRlciwgZXZlbnQsIGV2ZW50VGFyZ2V0LCBjdXJFdmVudFRhcmdldCk7XG5cbiAgICAgICAgICAgIHRoaXMucmVtb3ZlUG9pbnRlcihwb2ludGVyKTtcbiAgICAgICAgfSxcblxuICAgICAgICBwb2ludGVyQ2FuY2VsOiBmdW5jdGlvbiAocG9pbnRlciwgZXZlbnQsIGV2ZW50VGFyZ2V0LCBjdXJFdmVudFRhcmdldCkge1xuICAgICAgICAgICAgdmFyIHBvaW50ZXJJbmRleCA9IHRoaXMubW91c2U/IDAgOiBpbmRleE9mKHRoaXMucG9pbnRlcklkcywgZ2V0UG9pbnRlcklkKHBvaW50ZXIpKTtcblxuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuaG9sZFRpbWVyc1twb2ludGVySW5kZXhdKTtcblxuICAgICAgICAgICAgdGhpcy5jb2xsZWN0RXZlbnRUYXJnZXRzKHBvaW50ZXIsIGV2ZW50LCBldmVudFRhcmdldCwgJ2NhbmNlbCcpO1xuICAgICAgICAgICAgdGhpcy5wb2ludGVyRW5kKHBvaW50ZXIsIGV2ZW50LCBldmVudFRhcmdldCwgY3VyRXZlbnRUYXJnZXQpO1xuXG4gICAgICAgICAgICB0aGlzLnJlbW92ZVBvaW50ZXIocG9pbnRlcik7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLy8gaHR0cDovL3d3dy5xdWlya3Ntb2RlLm9yZy9kb20vZXZlbnRzL2NsaWNrLmh0bWxcbiAgICAgICAgLy8gPkV2ZW50cyBsZWFkaW5nIHRvIGRibGNsaWNrXG4gICAgICAgIC8vXG4gICAgICAgIC8vIElFOCBkb2Vzbid0IGZpcmUgZG93biBldmVudCBiZWZvcmUgZGJsY2xpY2suXG4gICAgICAgIC8vIFRoaXMgd29ya2Fyb3VuZCB0cmllcyB0byBmaXJlIGEgdGFwIGFuZCBkb3VibGV0YXAgYWZ0ZXIgZGJsY2xpY2tcbiAgICAgICAgaWU4RGJsY2xpY2s6IGZ1bmN0aW9uIChwb2ludGVyLCBldmVudCwgZXZlbnRUYXJnZXQpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLnByZXZUYXBcbiAgICAgICAgICAgICAgICAmJiBldmVudC5jbGllbnRYID09PSB0aGlzLnByZXZUYXAuY2xpZW50WFxuICAgICAgICAgICAgICAgICYmIGV2ZW50LmNsaWVudFkgPT09IHRoaXMucHJldlRhcC5jbGllbnRZXG4gICAgICAgICAgICAgICAgJiYgZXZlbnRUYXJnZXQgICA9PT0gdGhpcy5wcmV2VGFwLnRhcmdldCkge1xuXG4gICAgICAgICAgICAgICAgdGhpcy5kb3duVGFyZ2V0c1swXSA9IGV2ZW50VGFyZ2V0O1xuICAgICAgICAgICAgICAgIHRoaXMuZG93blRpbWVzWzBdID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5jb2xsZWN0RXZlbnRUYXJnZXRzKHBvaW50ZXIsIGV2ZW50LCBldmVudFRhcmdldCwgJ3RhcCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIC8vIEVuZCBpbnRlcmFjdCBtb3ZlIGV2ZW50cyBhbmQgc3RvcCBhdXRvLXNjcm9sbCB1bmxlc3MgaW5lcnRpYSBpcyBlbmFibGVkXG4gICAgICAgIHBvaW50ZXJFbmQ6IGZ1bmN0aW9uIChwb2ludGVyLCBldmVudCwgZXZlbnRUYXJnZXQsIGN1ckV2ZW50VGFyZ2V0KSB7XG4gICAgICAgICAgICB2YXIgZW5kRXZlbnQsXG4gICAgICAgICAgICAgICAgdGFyZ2V0ID0gdGhpcy50YXJnZXQsXG4gICAgICAgICAgICAgICAgb3B0aW9ucyA9IHRhcmdldCAmJiB0YXJnZXQub3B0aW9ucyxcbiAgICAgICAgICAgICAgICBpbmVydGlhT3B0aW9ucyA9IG9wdGlvbnMgJiYgdGhpcy5wcmVwYXJlZC5uYW1lICYmIG9wdGlvbnNbdGhpcy5wcmVwYXJlZC5uYW1lXS5pbmVydGlhLFxuICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMgPSB0aGlzLmluZXJ0aWFTdGF0dXM7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLmludGVyYWN0aW5nKCkpIHtcblxuICAgICAgICAgICAgICAgIGlmIChpbmVydGlhU3RhdHVzLmFjdGl2ZSAmJiAhaW5lcnRpYVN0YXR1cy5lbmRpbmcpIHsgcmV0dXJuOyB9XG5cbiAgICAgICAgICAgICAgICB2YXIgcG9pbnRlclNwZWVkLFxuICAgICAgICAgICAgICAgICAgICBub3cgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKSxcbiAgICAgICAgICAgICAgICAgICAgaW5lcnRpYVBvc3NpYmxlID0gZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGluZXJ0aWEgPSBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgc21vb3RoRW5kID0gZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGVuZFNuYXAgPSBjaGVja1NuYXAodGFyZ2V0LCB0aGlzLnByZXBhcmVkLm5hbWUpICYmIG9wdGlvbnNbdGhpcy5wcmVwYXJlZC5uYW1lXS5zbmFwLmVuZE9ubHksXG4gICAgICAgICAgICAgICAgICAgIGVuZFJlc3RyaWN0ID0gY2hlY2tSZXN0cmljdCh0YXJnZXQsIHRoaXMucHJlcGFyZWQubmFtZSkgJiYgb3B0aW9uc1t0aGlzLnByZXBhcmVkLm5hbWVdLnJlc3RyaWN0LmVuZE9ubHksXG4gICAgICAgICAgICAgICAgICAgIGR4ID0gMCxcbiAgICAgICAgICAgICAgICAgICAgZHkgPSAwLFxuICAgICAgICAgICAgICAgICAgICBzdGFydEV2ZW50O1xuXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZHJhZ2dpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgICAgICAob3B0aW9ucy5kcmFnLmF4aXMgPT09ICd4JyApIHsgcG9pbnRlclNwZWVkID0gTWF0aC5hYnModGhpcy5wb2ludGVyRGVsdGEuY2xpZW50LnZ4KTsgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIGlmIChvcHRpb25zLmRyYWcuYXhpcyA9PT0gJ3knICkgeyBwb2ludGVyU3BlZWQgPSBNYXRoLmFicyh0aGlzLnBvaW50ZXJEZWx0YS5jbGllbnQudnkpOyB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2UgICAvKm9wdGlvbnMuZHJhZy5heGlzID09PSAneHknKi97IHBvaW50ZXJTcGVlZCA9IHRoaXMucG9pbnRlckRlbHRhLmNsaWVudC5zcGVlZDsgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcG9pbnRlclNwZWVkID0gdGhpcy5wb2ludGVyRGVsdGEuY2xpZW50LnNwZWVkO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIGNoZWNrIGlmIGluZXJ0aWEgc2hvdWxkIGJlIHN0YXJ0ZWRcbiAgICAgICAgICAgICAgICBpbmVydGlhUG9zc2libGUgPSAoaW5lcnRpYU9wdGlvbnMgJiYgaW5lcnRpYU9wdGlvbnMuZW5hYmxlZFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAmJiB0aGlzLnByZXBhcmVkLm5hbWUgIT09ICdnZXN0dXJlJ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAmJiBldmVudCAhPT0gaW5lcnRpYVN0YXR1cy5zdGFydEV2ZW50KTtcblxuICAgICAgICAgICAgICAgIGluZXJ0aWEgPSAoaW5lcnRpYVBvc3NpYmxlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAmJiAobm93IC0gdGhpcy5jdXJDb29yZHMudGltZVN0YW1wKSA8IDUwXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAmJiBwb2ludGVyU3BlZWQgPiBpbmVydGlhT3B0aW9ucy5taW5TcGVlZFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgJiYgcG9pbnRlclNwZWVkID4gaW5lcnRpYU9wdGlvbnMuZW5kU3BlZWQpO1xuXG4gICAgICAgICAgICAgICAgaWYgKGluZXJ0aWFQb3NzaWJsZSAmJiAhaW5lcnRpYSAmJiAoZW5kU25hcCB8fCBlbmRSZXN0cmljdCkpIHtcblxuICAgICAgICAgICAgICAgICAgICB2YXIgc25hcFJlc3RyaWN0ID0ge307XG5cbiAgICAgICAgICAgICAgICAgICAgc25hcFJlc3RyaWN0LnNuYXAgPSBzbmFwUmVzdHJpY3QucmVzdHJpY3QgPSBzbmFwUmVzdHJpY3Q7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGVuZFNuYXApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0U25hcHBpbmcodGhpcy5jdXJDb29yZHMucGFnZSwgc25hcFJlc3RyaWN0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzbmFwUmVzdHJpY3QubG9ja2VkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZHggKz0gc25hcFJlc3RyaWN0LmR4O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGR5ICs9IHNuYXBSZXN0cmljdC5keTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlmIChlbmRSZXN0cmljdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXRSZXN0cmljdGlvbih0aGlzLmN1ckNvb3Jkcy5wYWdlLCBzbmFwUmVzdHJpY3QpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHNuYXBSZXN0cmljdC5yZXN0cmljdGVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZHggKz0gc25hcFJlc3RyaWN0LmR4O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGR5ICs9IHNuYXBSZXN0cmljdC5keTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlmIChkeCB8fCBkeSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc21vb3RoRW5kID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChpbmVydGlhIHx8IHNtb290aEVuZCkge1xuICAgICAgICAgICAgICAgICAgICBjb3B5Q29vcmRzKGluZXJ0aWFTdGF0dXMudXBDb29yZHMsIHRoaXMuY3VyQ29vcmRzKTtcblxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBvaW50ZXJzWzBdID0gaW5lcnRpYVN0YXR1cy5zdGFydEV2ZW50ID0gc3RhcnRFdmVudCA9XG4gICAgICAgICAgICAgICAgICAgICAgICBuZXcgSW50ZXJhY3RFdmVudCh0aGlzLCBldmVudCwgdGhpcy5wcmVwYXJlZC5uYW1lLCAnaW5lcnRpYXN0YXJ0JywgdGhpcy5lbGVtZW50KTtcblxuICAgICAgICAgICAgICAgICAgICBpbmVydGlhU3RhdHVzLnQwID0gbm93O1xuXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldC5maXJlKGluZXJ0aWFTdGF0dXMuc3RhcnRFdmVudCk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGluZXJ0aWEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMudngwID0gdGhpcy5wb2ludGVyRGVsdGEuY2xpZW50LnZ4O1xuICAgICAgICAgICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy52eTAgPSB0aGlzLnBvaW50ZXJEZWx0YS5jbGllbnQudnk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbmVydGlhU3RhdHVzLnYwID0gcG9pbnRlclNwZWVkO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmNhbGNJbmVydGlhKGluZXJ0aWFTdGF0dXMpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgcGFnZSA9IGV4dGVuZCh7fSwgdGhpcy5jdXJDb29yZHMucGFnZSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb3JpZ2luID0gZ2V0T3JpZ2luWFkodGFyZ2V0LCB0aGlzLmVsZW1lbnQpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXR1c09iamVjdDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgcGFnZS54ID0gcGFnZS54ICsgaW5lcnRpYVN0YXR1cy54ZSAtIG9yaWdpbi54O1xuICAgICAgICAgICAgICAgICAgICAgICAgcGFnZS55ID0gcGFnZS55ICsgaW5lcnRpYVN0YXR1cy55ZSAtIG9yaWdpbi55O1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGF0dXNPYmplY3QgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXNlU3RhdHVzWFk6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgeDogcGFnZS54LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHk6IHBhZ2UueSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkeDogMCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkeTogMCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzbmFwOiBudWxsXG4gICAgICAgICAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGF0dXNPYmplY3Quc25hcCA9IHN0YXR1c09iamVjdDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgZHggPSBkeSA9IDA7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChlbmRTbmFwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHNuYXAgPSB0aGlzLnNldFNuYXBwaW5nKHRoaXMuY3VyQ29vcmRzLnBhZ2UsIHN0YXR1c09iamVjdCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoc25hcC5sb2NrZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZHggKz0gc25hcC5keDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZHkgKz0gc25hcC5keTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChlbmRSZXN0cmljdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciByZXN0cmljdCA9IHRoaXMuc2V0UmVzdHJpY3Rpb24odGhpcy5jdXJDb29yZHMucGFnZSwgc3RhdHVzT2JqZWN0KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZXN0cmljdC5yZXN0cmljdGVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGR4ICs9IHJlc3RyaWN0LmR4O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkeSArPSByZXN0cmljdC5keTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMubW9kaWZpZWRYZSArPSBkeDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMubW9kaWZpZWRZZSArPSBkeTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy5pID0gcmVxRnJhbWUodGhpcy5ib3VuZEluZXJ0aWFGcmFtZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbmVydGlhU3RhdHVzLnNtb290aEVuZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbmVydGlhU3RhdHVzLnhlID0gZHg7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbmVydGlhU3RhdHVzLnllID0gZHk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMuc3ggPSBpbmVydGlhU3RhdHVzLnN5ID0gMDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy5pID0gcmVxRnJhbWUodGhpcy5ib3VuZFNtb290aEVuZEZyYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMuYWN0aXZlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChlbmRTbmFwIHx8IGVuZFJlc3RyaWN0KSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGZpcmUgYSBtb3ZlIGV2ZW50IGF0IHRoZSBzbmFwcGVkIGNvb3JkaW5hdGVzXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucG9pbnRlck1vdmUocG9pbnRlciwgZXZlbnQsIGV2ZW50VGFyZ2V0LCBjdXJFdmVudFRhcmdldCwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodGhpcy5kcmFnZ2luZykge1xuICAgICAgICAgICAgICAgIGVuZEV2ZW50ID0gbmV3IEludGVyYWN0RXZlbnQodGhpcywgZXZlbnQsICdkcmFnJywgJ2VuZCcsIHRoaXMuZWxlbWVudCk7XG5cbiAgICAgICAgICAgICAgICB2YXIgZHJhZ2dhYmxlRWxlbWVudCA9IHRoaXMuZWxlbWVudCxcbiAgICAgICAgICAgICAgICAgICAgZHJvcCA9IHRoaXMuZ2V0RHJvcChlbmRFdmVudCwgZXZlbnQsIGRyYWdnYWJsZUVsZW1lbnQpO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5kcm9wVGFyZ2V0ID0gZHJvcC5kcm9wem9uZTtcbiAgICAgICAgICAgICAgICB0aGlzLmRyb3BFbGVtZW50ID0gZHJvcC5lbGVtZW50O1xuXG4gICAgICAgICAgICAgICAgdmFyIGRyb3BFdmVudHMgPSB0aGlzLmdldERyb3BFdmVudHMoZXZlbnQsIGVuZEV2ZW50KTtcblxuICAgICAgICAgICAgICAgIGlmIChkcm9wRXZlbnRzLmxlYXZlKSB7IHRoaXMucHJldkRyb3BUYXJnZXQuZmlyZShkcm9wRXZlbnRzLmxlYXZlKTsgfVxuICAgICAgICAgICAgICAgIGlmIChkcm9wRXZlbnRzLmVudGVyKSB7ICAgICB0aGlzLmRyb3BUYXJnZXQuZmlyZShkcm9wRXZlbnRzLmVudGVyKTsgfVxuICAgICAgICAgICAgICAgIGlmIChkcm9wRXZlbnRzLmRyb3AgKSB7ICAgICB0aGlzLmRyb3BUYXJnZXQuZmlyZShkcm9wRXZlbnRzLmRyb3AgKTsgfVxuICAgICAgICAgICAgICAgIGlmIChkcm9wRXZlbnRzLmRlYWN0aXZhdGUpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5maXJlQWN0aXZlRHJvcHMoZHJvcEV2ZW50cy5kZWFjdGl2YXRlKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0YXJnZXQuZmlyZShlbmRFdmVudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmICh0aGlzLnJlc2l6aW5nKSB7XG4gICAgICAgICAgICAgICAgZW5kRXZlbnQgPSBuZXcgSW50ZXJhY3RFdmVudCh0aGlzLCBldmVudCwgJ3Jlc2l6ZScsICdlbmQnLCB0aGlzLmVsZW1lbnQpO1xuICAgICAgICAgICAgICAgIHRhcmdldC5maXJlKGVuZEV2ZW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKHRoaXMuZ2VzdHVyaW5nKSB7XG4gICAgICAgICAgICAgICAgZW5kRXZlbnQgPSBuZXcgSW50ZXJhY3RFdmVudCh0aGlzLCBldmVudCwgJ2dlc3R1cmUnLCAnZW5kJywgdGhpcy5lbGVtZW50KTtcbiAgICAgICAgICAgICAgICB0YXJnZXQuZmlyZShlbmRFdmVudCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuc3RvcChldmVudCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgY29sbGVjdERyb3BzOiBmdW5jdGlvbiAoZWxlbWVudCkge1xuICAgICAgICAgICAgdmFyIGRyb3BzID0gW10sXG4gICAgICAgICAgICAgICAgZWxlbWVudHMgPSBbXSxcbiAgICAgICAgICAgICAgICBpO1xuXG4gICAgICAgICAgICBlbGVtZW50ID0gZWxlbWVudCB8fCB0aGlzLmVsZW1lbnQ7XG5cbiAgICAgICAgICAgIC8vIGNvbGxlY3QgYWxsIGRyb3B6b25lcyBhbmQgdGhlaXIgZWxlbWVudHMgd2hpY2ggcXVhbGlmeSBmb3IgYSBkcm9wXG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgaW50ZXJhY3RhYmxlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGlmICghaW50ZXJhY3RhYmxlc1tpXS5vcHRpb25zLmRyb3AuZW5hYmxlZCkgeyBjb250aW51ZTsgfVxuXG4gICAgICAgICAgICAgICAgdmFyIGN1cnJlbnQgPSBpbnRlcmFjdGFibGVzW2ldLFxuICAgICAgICAgICAgICAgICAgICBhY2NlcHQgPSBjdXJyZW50Lm9wdGlvbnMuZHJvcC5hY2NlcHQ7XG5cbiAgICAgICAgICAgICAgICAvLyB0ZXN0IHRoZSBkcmFnZ2FibGUgZWxlbWVudCBhZ2FpbnN0IHRoZSBkcm9wem9uZSdzIGFjY2VwdCBzZXR0aW5nXG4gICAgICAgICAgICAgICAgaWYgKChpc0VsZW1lbnQoYWNjZXB0KSAmJiBhY2NlcHQgIT09IGVsZW1lbnQpXG4gICAgICAgICAgICAgICAgICAgIHx8IChpc1N0cmluZyhhY2NlcHQpXG4gICAgICAgICAgICAgICAgICAgICAgICAmJiAhbWF0Y2hlc1NlbGVjdG9yKGVsZW1lbnQsIGFjY2VwdCkpKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gcXVlcnkgZm9yIG5ldyBlbGVtZW50cyBpZiBuZWNlc3NhcnlcbiAgICAgICAgICAgICAgICB2YXIgZHJvcEVsZW1lbnRzID0gY3VycmVudC5zZWxlY3Rvcj8gY3VycmVudC5fY29udGV4dC5xdWVyeVNlbGVjdG9yQWxsKGN1cnJlbnQuc2VsZWN0b3IpIDogW2N1cnJlbnQuX2VsZW1lbnRdO1xuXG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaiA9IDAsIGxlbiA9IGRyb3BFbGVtZW50cy5sZW5ndGg7IGogPCBsZW47IGorKykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgY3VycmVudEVsZW1lbnQgPSBkcm9wRWxlbWVudHNbal07XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGN1cnJlbnRFbGVtZW50ID09PSBlbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGRyb3BzLnB1c2goY3VycmVudCk7XG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnRzLnB1c2goY3VycmVudEVsZW1lbnQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBkcm9wem9uZXM6IGRyb3BzLFxuICAgICAgICAgICAgICAgIGVsZW1lbnRzOiBlbGVtZW50c1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfSxcblxuICAgICAgICBmaXJlQWN0aXZlRHJvcHM6IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgdmFyIGksXG4gICAgICAgICAgICAgICAgY3VycmVudCxcbiAgICAgICAgICAgICAgICBjdXJyZW50RWxlbWVudCxcbiAgICAgICAgICAgICAgICBwcmV2RWxlbWVudDtcblxuICAgICAgICAgICAgLy8gbG9vcCB0aHJvdWdoIGFsbCBhY3RpdmUgZHJvcHpvbmVzIGFuZCB0cmlnZ2VyIGV2ZW50XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgdGhpcy5hY3RpdmVEcm9wcy5kcm9wem9uZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50ID0gdGhpcy5hY3RpdmVEcm9wcy5kcm9wem9uZXNbaV07XG4gICAgICAgICAgICAgICAgY3VycmVudEVsZW1lbnQgPSB0aGlzLmFjdGl2ZURyb3BzLmVsZW1lbnRzIFtpXTtcblxuICAgICAgICAgICAgICAgIC8vIHByZXZlbnQgdHJpZ2dlciBvZiBkdXBsaWNhdGUgZXZlbnRzIG9uIHNhbWUgZWxlbWVudFxuICAgICAgICAgICAgICAgIGlmIChjdXJyZW50RWxlbWVudCAhPT0gcHJldkVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gc2V0IGN1cnJlbnQgZWxlbWVudCBhcyBldmVudCB0YXJnZXRcbiAgICAgICAgICAgICAgICAgICAgZXZlbnQudGFyZ2V0ID0gY3VycmVudEVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnQuZmlyZShldmVudCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHByZXZFbGVtZW50ID0gY3VycmVudEVsZW1lbnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgLy8gQ29sbGVjdCBhIG5ldyBzZXQgb2YgcG9zc2libGUgZHJvcHMgYW5kIHNhdmUgdGhlbSBpbiBhY3RpdmVEcm9wcy5cbiAgICAgICAgLy8gc2V0QWN0aXZlRHJvcHMgc2hvdWxkIGFsd2F5cyBiZSBjYWxsZWQgd2hlbiBhIGRyYWcgaGFzIGp1c3Qgc3RhcnRlZCBvciBhXG4gICAgICAgIC8vIGRyYWcgZXZlbnQgaGFwcGVucyB3aGlsZSBkeW5hbWljRHJvcCBpcyB0cnVlXG4gICAgICAgIHNldEFjdGl2ZURyb3BzOiBmdW5jdGlvbiAoZHJhZ0VsZW1lbnQpIHtcbiAgICAgICAgICAgIC8vIGdldCBkcm9wem9uZXMgYW5kIHRoZWlyIGVsZW1lbnRzIHRoYXQgY291bGQgcmVjZWl2ZSB0aGUgZHJhZ2dhYmxlXG4gICAgICAgICAgICB2YXIgcG9zc2libGVEcm9wcyA9IHRoaXMuY29sbGVjdERyb3BzKGRyYWdFbGVtZW50LCB0cnVlKTtcblxuICAgICAgICAgICAgdGhpcy5hY3RpdmVEcm9wcy5kcm9wem9uZXMgPSBwb3NzaWJsZURyb3BzLmRyb3B6b25lcztcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlRHJvcHMuZWxlbWVudHMgID0gcG9zc2libGVEcm9wcy5lbGVtZW50cztcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlRHJvcHMucmVjdHMgICAgID0gW107XG5cbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5hY3RpdmVEcm9wcy5kcm9wem9uZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZURyb3BzLnJlY3RzW2ldID0gdGhpcy5hY3RpdmVEcm9wcy5kcm9wem9uZXNbaV0uZ2V0UmVjdCh0aGlzLmFjdGl2ZURyb3BzLmVsZW1lbnRzW2ldKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBnZXREcm9wOiBmdW5jdGlvbiAoZHJhZ0V2ZW50LCBldmVudCwgZHJhZ0VsZW1lbnQpIHtcbiAgICAgICAgICAgIHZhciB2YWxpZERyb3BzID0gW107XG5cbiAgICAgICAgICAgIGlmIChkeW5hbWljRHJvcCkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0QWN0aXZlRHJvcHMoZHJhZ0VsZW1lbnQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBjb2xsZWN0IGFsbCBkcm9wem9uZXMgYW5kIHRoZWlyIGVsZW1lbnRzIHdoaWNoIHF1YWxpZnkgZm9yIGEgZHJvcFxuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLmFjdGl2ZURyb3BzLmRyb3B6b25lcy5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgICAgIHZhciBjdXJyZW50ICAgICAgICA9IHRoaXMuYWN0aXZlRHJvcHMuZHJvcHpvbmVzW2pdLFxuICAgICAgICAgICAgICAgICAgICBjdXJyZW50RWxlbWVudCA9IHRoaXMuYWN0aXZlRHJvcHMuZWxlbWVudHMgW2pdLFxuICAgICAgICAgICAgICAgICAgICByZWN0ICAgICAgICAgICA9IHRoaXMuYWN0aXZlRHJvcHMucmVjdHMgICAgW2pdO1xuXG4gICAgICAgICAgICAgICAgdmFsaWREcm9wcy5wdXNoKGN1cnJlbnQuZHJvcENoZWNrKGRyYWdFdmVudCwgZXZlbnQsIHRoaXMudGFyZ2V0LCBkcmFnRWxlbWVudCwgY3VycmVudEVsZW1lbnQsIHJlY3QpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgID8gY3VycmVudEVsZW1lbnRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgOiBudWxsKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gZ2V0IHRoZSBtb3N0IGFwcHJvcHJpYXRlIGRyb3B6b25lIGJhc2VkIG9uIERPTSBkZXB0aCBhbmQgb3JkZXJcbiAgICAgICAgICAgIHZhciBkcm9wSW5kZXggPSBpbmRleE9mRGVlcGVzdEVsZW1lbnQodmFsaWREcm9wcyksXG4gICAgICAgICAgICAgICAgZHJvcHpvbmUgID0gdGhpcy5hY3RpdmVEcm9wcy5kcm9wem9uZXNbZHJvcEluZGV4XSB8fCBudWxsLFxuICAgICAgICAgICAgICAgIGVsZW1lbnQgICA9IHRoaXMuYWN0aXZlRHJvcHMuZWxlbWVudHMgW2Ryb3BJbmRleF0gfHwgbnVsbDtcblxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBkcm9wem9uZTogZHJvcHpvbmUsXG4gICAgICAgICAgICAgICAgZWxlbWVudDogZWxlbWVudFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSxcblxuICAgICAgICBnZXREcm9wRXZlbnRzOiBmdW5jdGlvbiAocG9pbnRlckV2ZW50LCBkcmFnRXZlbnQpIHtcbiAgICAgICAgICAgIHZhciBkcm9wRXZlbnRzID0ge1xuICAgICAgICAgICAgICAgIGVudGVyICAgICA6IG51bGwsXG4gICAgICAgICAgICAgICAgbGVhdmUgICAgIDogbnVsbCxcbiAgICAgICAgICAgICAgICBhY3RpdmF0ZSAgOiBudWxsLFxuICAgICAgICAgICAgICAgIGRlYWN0aXZhdGU6IG51bGwsXG4gICAgICAgICAgICAgICAgbW92ZSAgICAgIDogbnVsbCxcbiAgICAgICAgICAgICAgICBkcm9wICAgICAgOiBudWxsXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBpZiAodGhpcy5kcm9wRWxlbWVudCAhPT0gdGhpcy5wcmV2RHJvcEVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICAvLyBpZiB0aGVyZSB3YXMgYSBwcmV2RHJvcFRhcmdldCwgY3JlYXRlIGEgZHJhZ2xlYXZlIGV2ZW50XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMucHJldkRyb3BUYXJnZXQpIHtcbiAgICAgICAgICAgICAgICAgICAgZHJvcEV2ZW50cy5sZWF2ZSA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldCAgICAgICA6IHRoaXMucHJldkRyb3BFbGVtZW50LFxuICAgICAgICAgICAgICAgICAgICAgICAgZHJvcHpvbmUgICAgIDogdGhpcy5wcmV2RHJvcFRhcmdldCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlbGF0ZWRUYXJnZXQ6IGRyYWdFdmVudC50YXJnZXQsXG4gICAgICAgICAgICAgICAgICAgICAgICBkcmFnZ2FibGUgICAgOiBkcmFnRXZlbnQuaW50ZXJhY3RhYmxlLFxuICAgICAgICAgICAgICAgICAgICAgICAgZHJhZ0V2ZW50ICAgIDogZHJhZ0V2ZW50LFxuICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXJhY3Rpb24gIDogdGhpcyxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRpbWVTdGFtcCAgICA6IGRyYWdFdmVudC50aW1lU3RhbXAsXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlICAgICAgICAgOiAnZHJhZ2xlYXZlJ1xuICAgICAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgICAgIGRyYWdFdmVudC5kcmFnTGVhdmUgPSB0aGlzLnByZXZEcm9wRWxlbWVudDtcbiAgICAgICAgICAgICAgICAgICAgZHJhZ0V2ZW50LnByZXZEcm9wem9uZSA9IHRoaXMucHJldkRyb3BUYXJnZXQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIGlmIHRoZSBkcm9wVGFyZ2V0IGlzIG5vdCBudWxsLCBjcmVhdGUgYSBkcmFnZW50ZXIgZXZlbnRcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5kcm9wVGFyZ2V0KSB7XG4gICAgICAgICAgICAgICAgICAgIGRyb3BFdmVudHMuZW50ZXIgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXQgICAgICAgOiB0aGlzLmRyb3BFbGVtZW50LFxuICAgICAgICAgICAgICAgICAgICAgICAgZHJvcHpvbmUgICAgIDogdGhpcy5kcm9wVGFyZ2V0LFxuICAgICAgICAgICAgICAgICAgICAgICAgcmVsYXRlZFRhcmdldDogZHJhZ0V2ZW50LnRhcmdldCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRyYWdnYWJsZSAgICA6IGRyYWdFdmVudC5pbnRlcmFjdGFibGUsXG4gICAgICAgICAgICAgICAgICAgICAgICBkcmFnRXZlbnQgICAgOiBkcmFnRXZlbnQsXG4gICAgICAgICAgICAgICAgICAgICAgICBpbnRlcmFjdGlvbiAgOiB0aGlzLFxuICAgICAgICAgICAgICAgICAgICAgICAgdGltZVN0YW1wICAgIDogZHJhZ0V2ZW50LnRpbWVTdGFtcCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGUgICAgICAgICA6ICdkcmFnZW50ZXInXG4gICAgICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAgICAgZHJhZ0V2ZW50LmRyYWdFbnRlciA9IHRoaXMuZHJvcEVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgICAgIGRyYWdFdmVudC5kcm9wem9uZSA9IHRoaXMuZHJvcFRhcmdldDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChkcmFnRXZlbnQudHlwZSA9PT0gJ2RyYWdlbmQnICYmIHRoaXMuZHJvcFRhcmdldCkge1xuICAgICAgICAgICAgICAgIGRyb3BFdmVudHMuZHJvcCA9IHtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0ICAgICAgIDogdGhpcy5kcm9wRWxlbWVudCxcbiAgICAgICAgICAgICAgICAgICAgZHJvcHpvbmUgICAgIDogdGhpcy5kcm9wVGFyZ2V0LFxuICAgICAgICAgICAgICAgICAgICByZWxhdGVkVGFyZ2V0OiBkcmFnRXZlbnQudGFyZ2V0LFxuICAgICAgICAgICAgICAgICAgICBkcmFnZ2FibGUgICAgOiBkcmFnRXZlbnQuaW50ZXJhY3RhYmxlLFxuICAgICAgICAgICAgICAgICAgICBkcmFnRXZlbnQgICAgOiBkcmFnRXZlbnQsXG4gICAgICAgICAgICAgICAgICAgIGludGVyYWN0aW9uICA6IHRoaXMsXG4gICAgICAgICAgICAgICAgICAgIHRpbWVTdGFtcCAgICA6IGRyYWdFdmVudC50aW1lU3RhbXAsXG4gICAgICAgICAgICAgICAgICAgIHR5cGUgICAgICAgICA6ICdkcm9wJ1xuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICBkcmFnRXZlbnQuZHJvcHpvbmUgPSB0aGlzLmRyb3BUYXJnZXQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZHJhZ0V2ZW50LnR5cGUgPT09ICdkcmFnc3RhcnQnKSB7XG4gICAgICAgICAgICAgICAgZHJvcEV2ZW50cy5hY3RpdmF0ZSA9IHtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0ICAgICAgIDogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgZHJvcHpvbmUgICAgIDogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgcmVsYXRlZFRhcmdldDogZHJhZ0V2ZW50LnRhcmdldCxcbiAgICAgICAgICAgICAgICAgICAgZHJhZ2dhYmxlICAgIDogZHJhZ0V2ZW50LmludGVyYWN0YWJsZSxcbiAgICAgICAgICAgICAgICAgICAgZHJhZ0V2ZW50ICAgIDogZHJhZ0V2ZW50LFxuICAgICAgICAgICAgICAgICAgICBpbnRlcmFjdGlvbiAgOiB0aGlzLFxuICAgICAgICAgICAgICAgICAgICB0aW1lU3RhbXAgICAgOiBkcmFnRXZlbnQudGltZVN0YW1wLFxuICAgICAgICAgICAgICAgICAgICB0eXBlICAgICAgICAgOiAnZHJvcGFjdGl2YXRlJ1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoZHJhZ0V2ZW50LnR5cGUgPT09ICdkcmFnZW5kJykge1xuICAgICAgICAgICAgICAgIGRyb3BFdmVudHMuZGVhY3RpdmF0ZSA9IHtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0ICAgICAgIDogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgZHJvcHpvbmUgICAgIDogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgcmVsYXRlZFRhcmdldDogZHJhZ0V2ZW50LnRhcmdldCxcbiAgICAgICAgICAgICAgICAgICAgZHJhZ2dhYmxlICAgIDogZHJhZ0V2ZW50LmludGVyYWN0YWJsZSxcbiAgICAgICAgICAgICAgICAgICAgZHJhZ0V2ZW50ICAgIDogZHJhZ0V2ZW50LFxuICAgICAgICAgICAgICAgICAgICBpbnRlcmFjdGlvbiAgOiB0aGlzLFxuICAgICAgICAgICAgICAgICAgICB0aW1lU3RhbXAgICAgOiBkcmFnRXZlbnQudGltZVN0YW1wLFxuICAgICAgICAgICAgICAgICAgICB0eXBlICAgICAgICAgOiAnZHJvcGRlYWN0aXZhdGUnXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChkcmFnRXZlbnQudHlwZSA9PT0gJ2RyYWdtb3ZlJyAmJiB0aGlzLmRyb3BUYXJnZXQpIHtcbiAgICAgICAgICAgICAgICBkcm9wRXZlbnRzLm1vdmUgPSB7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldCAgICAgICA6IHRoaXMuZHJvcEVsZW1lbnQsXG4gICAgICAgICAgICAgICAgICAgIGRyb3B6b25lICAgICA6IHRoaXMuZHJvcFRhcmdldCxcbiAgICAgICAgICAgICAgICAgICAgcmVsYXRlZFRhcmdldDogZHJhZ0V2ZW50LnRhcmdldCxcbiAgICAgICAgICAgICAgICAgICAgZHJhZ2dhYmxlICAgIDogZHJhZ0V2ZW50LmludGVyYWN0YWJsZSxcbiAgICAgICAgICAgICAgICAgICAgZHJhZ0V2ZW50ICAgIDogZHJhZ0V2ZW50LFxuICAgICAgICAgICAgICAgICAgICBpbnRlcmFjdGlvbiAgOiB0aGlzLFxuICAgICAgICAgICAgICAgICAgICBkcmFnbW92ZSAgICAgOiBkcmFnRXZlbnQsXG4gICAgICAgICAgICAgICAgICAgIHRpbWVTdGFtcCAgICA6IGRyYWdFdmVudC50aW1lU3RhbXAsXG4gICAgICAgICAgICAgICAgICAgIHR5cGUgICAgICAgICA6ICdkcm9wbW92ZSdcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIGRyYWdFdmVudC5kcm9wem9uZSA9IHRoaXMuZHJvcFRhcmdldDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGRyb3BFdmVudHM7XG4gICAgICAgIH0sXG5cbiAgICAgICAgY3VycmVudEFjdGlvbjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuICh0aGlzLmRyYWdnaW5nICYmICdkcmFnJykgfHwgKHRoaXMucmVzaXppbmcgJiYgJ3Jlc2l6ZScpIHx8ICh0aGlzLmdlc3R1cmluZyAmJiAnZ2VzdHVyZScpIHx8IG51bGw7XG4gICAgICAgIH0sXG5cbiAgICAgICAgaW50ZXJhY3Rpbmc6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmRyYWdnaW5nIHx8IHRoaXMucmVzaXppbmcgfHwgdGhpcy5nZXN0dXJpbmc7XG4gICAgICAgIH0sXG5cbiAgICAgICAgY2xlYXJUYXJnZXRzOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB0aGlzLnRhcmdldCA9IHRoaXMuZWxlbWVudCA9IG51bGw7XG5cbiAgICAgICAgICAgIHRoaXMuZHJvcFRhcmdldCA9IHRoaXMuZHJvcEVsZW1lbnQgPSB0aGlzLnByZXZEcm9wVGFyZ2V0ID0gdGhpcy5wcmV2RHJvcEVsZW1lbnQgPSBudWxsO1xuICAgICAgICB9LFxuXG4gICAgICAgIHN0b3A6IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgaWYgKHRoaXMuaW50ZXJhY3RpbmcoKSkge1xuICAgICAgICAgICAgICAgIGF1dG9TY3JvbGwuc3RvcCgpO1xuICAgICAgICAgICAgICAgIHRoaXMubWF0Y2hlcyA9IFtdO1xuICAgICAgICAgICAgICAgIHRoaXMubWF0Y2hFbGVtZW50cyA9IFtdO1xuXG4gICAgICAgICAgICAgICAgdmFyIHRhcmdldCA9IHRoaXMudGFyZ2V0O1xuXG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldC5vcHRpb25zLnN0eWxlQ3Vyc29yKSB7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldC5fZG9jLmRvY3VtZW50RWxlbWVudC5zdHlsZS5jdXJzb3IgPSAnJztcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBwcmV2ZW50IERlZmF1bHQgb25seSBpZiB3ZXJlIHByZXZpb3VzbHkgaW50ZXJhY3RpbmdcbiAgICAgICAgICAgICAgICBpZiAoZXZlbnQgJiYgaXNGdW5jdGlvbihldmVudC5wcmV2ZW50RGVmYXVsdCkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jaGVja0FuZFByZXZlbnREZWZhdWx0KGV2ZW50LCB0YXJnZXQsIHRoaXMuZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZHJhZ2dpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVEcm9wcy5kcm9wem9uZXMgPSB0aGlzLmFjdGl2ZURyb3BzLmVsZW1lbnRzID0gdGhpcy5hY3RpdmVEcm9wcy5yZWN0cyA9IG51bGw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLmNsZWFyVGFyZ2V0cygpO1xuXG4gICAgICAgICAgICB0aGlzLnBvaW50ZXJJc0Rvd24gPSB0aGlzLnNuYXBTdGF0dXMubG9ja2VkID0gdGhpcy5kcmFnZ2luZyA9IHRoaXMucmVzaXppbmcgPSB0aGlzLmdlc3R1cmluZyA9IGZhbHNlO1xuICAgICAgICAgICAgdGhpcy5wcmVwYXJlZC5uYW1lID0gdGhpcy5wcmV2RXZlbnQgPSBudWxsO1xuICAgICAgICAgICAgdGhpcy5pbmVydGlhU3RhdHVzLnJlc3VtZUR4ID0gdGhpcy5pbmVydGlhU3RhdHVzLnJlc3VtZUR5ID0gMDtcblxuICAgICAgICAgICAgLy8gcmVtb3ZlIHBvaW50ZXJzIGlmIHRoZWlyIElEIGlzbid0IGluIHRoaXMucG9pbnRlcklkc1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnBvaW50ZXJzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKGluZGV4T2YodGhpcy5wb2ludGVySWRzLCBnZXRQb2ludGVySWQodGhpcy5wb2ludGVyc1tpXSkpID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnBvaW50ZXJzLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgaW5lcnRpYUZyYW1lOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgaW5lcnRpYVN0YXR1cyA9IHRoaXMuaW5lcnRpYVN0YXR1cyxcbiAgICAgICAgICAgICAgICBvcHRpb25zID0gdGhpcy50YXJnZXQub3B0aW9uc1t0aGlzLnByZXBhcmVkLm5hbWVdLmluZXJ0aWEsXG4gICAgICAgICAgICAgICAgbGFtYmRhID0gb3B0aW9ucy5yZXNpc3RhbmNlLFxuICAgICAgICAgICAgICAgIHQgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKSAvIDEwMDAgLSBpbmVydGlhU3RhdHVzLnQwO1xuXG4gICAgICAgICAgICBpZiAodCA8IGluZXJ0aWFTdGF0dXMudGUpIHtcblxuICAgICAgICAgICAgICAgIHZhciBwcm9ncmVzcyA9ICAxIC0gKE1hdGguZXhwKC1sYW1iZGEgKiB0KSAtIGluZXJ0aWFTdGF0dXMubGFtYmRhX3YwKSAvIGluZXJ0aWFTdGF0dXMub25lX3ZlX3YwO1xuXG4gICAgICAgICAgICAgICAgaWYgKGluZXJ0aWFTdGF0dXMubW9kaWZpZWRYZSA9PT0gaW5lcnRpYVN0YXR1cy54ZSAmJiBpbmVydGlhU3RhdHVzLm1vZGlmaWVkWWUgPT09IGluZXJ0aWFTdGF0dXMueWUpIHtcbiAgICAgICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy5zeCA9IGluZXJ0aWFTdGF0dXMueGUgKiBwcm9ncmVzcztcbiAgICAgICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy5zeSA9IGluZXJ0aWFTdGF0dXMueWUgKiBwcm9ncmVzcztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBxdWFkUG9pbnQgPSBnZXRRdWFkcmF0aWNDdXJ2ZVBvaW50KFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDAsIDAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy54ZSwgaW5lcnRpYVN0YXR1cy55ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbmVydGlhU3RhdHVzLm1vZGlmaWVkWGUsIGluZXJ0aWFTdGF0dXMubW9kaWZpZWRZZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9ncmVzcyk7XG5cbiAgICAgICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy5zeCA9IHF1YWRQb2ludC54O1xuICAgICAgICAgICAgICAgICAgICBpbmVydGlhU3RhdHVzLnN5ID0gcXVhZFBvaW50Lnk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdGhpcy5wb2ludGVyTW92ZShpbmVydGlhU3RhdHVzLnN0YXJ0RXZlbnQsIGluZXJ0aWFTdGF0dXMuc3RhcnRFdmVudCk7XG5cbiAgICAgICAgICAgICAgICBpbmVydGlhU3RhdHVzLmkgPSByZXFGcmFtZSh0aGlzLmJvdW5kSW5lcnRpYUZyYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMuZW5kaW5nID0gdHJ1ZTtcblxuICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMuc3ggPSBpbmVydGlhU3RhdHVzLm1vZGlmaWVkWGU7XG4gICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy5zeSA9IGluZXJ0aWFTdGF0dXMubW9kaWZpZWRZZTtcblxuICAgICAgICAgICAgICAgIHRoaXMucG9pbnRlck1vdmUoaW5lcnRpYVN0YXR1cy5zdGFydEV2ZW50LCBpbmVydGlhU3RhdHVzLnN0YXJ0RXZlbnQpO1xuICAgICAgICAgICAgICAgIHRoaXMucG9pbnRlckVuZChpbmVydGlhU3RhdHVzLnN0YXJ0RXZlbnQsIGluZXJ0aWFTdGF0dXMuc3RhcnRFdmVudCk7XG5cbiAgICAgICAgICAgICAgICBpbmVydGlhU3RhdHVzLmFjdGl2ZSA9IGluZXJ0aWFTdGF0dXMuZW5kaW5nID0gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgc21vb3RoRW5kRnJhbWU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBpbmVydGlhU3RhdHVzID0gdGhpcy5pbmVydGlhU3RhdHVzLFxuICAgICAgICAgICAgICAgIHQgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKSAtIGluZXJ0aWFTdGF0dXMudDAsXG4gICAgICAgICAgICAgICAgZHVyYXRpb24gPSB0aGlzLnRhcmdldC5vcHRpb25zW3RoaXMucHJlcGFyZWQubmFtZV0uaW5lcnRpYS5zbW9vdGhFbmREdXJhdGlvbjtcblxuICAgICAgICAgICAgaWYgKHQgPCBkdXJhdGlvbikge1xuICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMuc3ggPSBlYXNlT3V0UXVhZCh0LCAwLCBpbmVydGlhU3RhdHVzLnhlLCBkdXJhdGlvbik7XG4gICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy5zeSA9IGVhc2VPdXRRdWFkKHQsIDAsIGluZXJ0aWFTdGF0dXMueWUsIGR1cmF0aW9uKTtcblxuICAgICAgICAgICAgICAgIHRoaXMucG9pbnRlck1vdmUoaW5lcnRpYVN0YXR1cy5zdGFydEV2ZW50LCBpbmVydGlhU3RhdHVzLnN0YXJ0RXZlbnQpO1xuXG4gICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy5pID0gcmVxRnJhbWUodGhpcy5ib3VuZFNtb290aEVuZEZyYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMuZW5kaW5nID0gdHJ1ZTtcblxuICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMuc3ggPSBpbmVydGlhU3RhdHVzLnhlO1xuICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMuc3kgPSBpbmVydGlhU3RhdHVzLnllO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5wb2ludGVyTW92ZShpbmVydGlhU3RhdHVzLnN0YXJ0RXZlbnQsIGluZXJ0aWFTdGF0dXMuc3RhcnRFdmVudCk7XG4gICAgICAgICAgICAgICAgdGhpcy5wb2ludGVyRW5kKGluZXJ0aWFTdGF0dXMuc3RhcnRFdmVudCwgaW5lcnRpYVN0YXR1cy5zdGFydEV2ZW50KTtcblxuICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMuc21vb3RoRW5kID1cbiAgICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMuYWN0aXZlID0gaW5lcnRpYVN0YXR1cy5lbmRpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBhZGRQb2ludGVyOiBmdW5jdGlvbiAocG9pbnRlcikge1xuICAgICAgICAgICAgdmFyIGlkID0gZ2V0UG9pbnRlcklkKHBvaW50ZXIpLFxuICAgICAgICAgICAgICAgIGluZGV4ID0gdGhpcy5tb3VzZT8gMCA6IGluZGV4T2YodGhpcy5wb2ludGVySWRzLCBpZCk7XG5cbiAgICAgICAgICAgIGlmIChpbmRleCA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICBpbmRleCA9IHRoaXMucG9pbnRlcklkcy5sZW5ndGg7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMucG9pbnRlcklkc1tpbmRleF0gPSBpZDtcbiAgICAgICAgICAgIHRoaXMucG9pbnRlcnNbaW5kZXhdID0gcG9pbnRlcjtcblxuICAgICAgICAgICAgcmV0dXJuIGluZGV4O1xuICAgICAgICB9LFxuXG4gICAgICAgIHJlbW92ZVBvaW50ZXI6IGZ1bmN0aW9uIChwb2ludGVyKSB7XG4gICAgICAgICAgICB2YXIgaWQgPSBnZXRQb2ludGVySWQocG9pbnRlciksXG4gICAgICAgICAgICAgICAgaW5kZXggPSB0aGlzLm1vdXNlPyAwIDogaW5kZXhPZih0aGlzLnBvaW50ZXJJZHMsIGlkKTtcblxuICAgICAgICAgICAgaWYgKGluZGV4ID09PSAtMSkgeyByZXR1cm47IH1cblxuICAgICAgICAgICAgdGhpcy5wb2ludGVycyAgIC5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICAgICAgdGhpcy5wb2ludGVySWRzIC5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICAgICAgdGhpcy5kb3duVGFyZ2V0cy5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICAgICAgdGhpcy5kb3duVGltZXMgIC5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICAgICAgdGhpcy5ob2xkVGltZXJzIC5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICB9LFxuXG4gICAgICAgIHJlY29yZFBvaW50ZXI6IGZ1bmN0aW9uIChwb2ludGVyKSB7XG4gICAgICAgICAgICB2YXIgaW5kZXggPSB0aGlzLm1vdXNlPyAwOiBpbmRleE9mKHRoaXMucG9pbnRlcklkcywgZ2V0UG9pbnRlcklkKHBvaW50ZXIpKTtcblxuICAgICAgICAgICAgaWYgKGluZGV4ID09PSAtMSkgeyByZXR1cm47IH1cblxuICAgICAgICAgICAgdGhpcy5wb2ludGVyc1tpbmRleF0gPSBwb2ludGVyO1xuICAgICAgICB9LFxuXG4gICAgICAgIGNvbGxlY3RFdmVudFRhcmdldHM6IGZ1bmN0aW9uIChwb2ludGVyLCBldmVudCwgZXZlbnRUYXJnZXQsIGV2ZW50VHlwZSkge1xuICAgICAgICAgICAgdmFyIHBvaW50ZXJJbmRleCA9IHRoaXMubW91c2U/IDAgOiBpbmRleE9mKHRoaXMucG9pbnRlcklkcywgZ2V0UG9pbnRlcklkKHBvaW50ZXIpKTtcblxuICAgICAgICAgICAgLy8gZG8gbm90IGZpcmUgYSB0YXAgZXZlbnQgaWYgdGhlIHBvaW50ZXIgd2FzIG1vdmVkIGJlZm9yZSBiZWluZyBsaWZ0ZWRcbiAgICAgICAgICAgIGlmIChldmVudFR5cGUgPT09ICd0YXAnICYmICh0aGlzLnBvaW50ZXJXYXNNb3ZlZFxuICAgICAgICAgICAgICAgIC8vIG9yIGlmIHRoZSBwb2ludGVydXAgdGFyZ2V0IGlzIGRpZmZlcmVudCB0byB0aGUgcG9pbnRlcmRvd24gdGFyZ2V0XG4gICAgICAgICAgICAgICAgfHwgISh0aGlzLmRvd25UYXJnZXRzW3BvaW50ZXJJbmRleF0gJiYgdGhpcy5kb3duVGFyZ2V0c1twb2ludGVySW5kZXhdID09PSBldmVudFRhcmdldCkpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgdGFyZ2V0cyA9IFtdLFxuICAgICAgICAgICAgICAgIGVsZW1lbnRzID0gW10sXG4gICAgICAgICAgICAgICAgZWxlbWVudCA9IGV2ZW50VGFyZ2V0O1xuXG4gICAgICAgICAgICBmdW5jdGlvbiBjb2xsZWN0U2VsZWN0b3JzIChpbnRlcmFjdGFibGUsIHNlbGVjdG9yLCBjb250ZXh0KSB7XG4gICAgICAgICAgICAgICAgdmFyIGVscyA9IGllOE1hdGNoZXNTZWxlY3RvclxuICAgICAgICAgICAgICAgICAgICAgICAgPyBjb250ZXh0LnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpXG4gICAgICAgICAgICAgICAgICAgICAgICA6IHVuZGVmaW5lZDtcblxuICAgICAgICAgICAgICAgIGlmIChpbnRlcmFjdGFibGUuX2lFdmVudHNbZXZlbnRUeXBlXVxuICAgICAgICAgICAgICAgICAgICAmJiBpc0VsZW1lbnQoZWxlbWVudClcbiAgICAgICAgICAgICAgICAgICAgJiYgaW5Db250ZXh0KGludGVyYWN0YWJsZSwgZWxlbWVudClcbiAgICAgICAgICAgICAgICAgICAgJiYgIXRlc3RJZ25vcmUoaW50ZXJhY3RhYmxlLCBlbGVtZW50LCBldmVudFRhcmdldClcbiAgICAgICAgICAgICAgICAgICAgJiYgdGVzdEFsbG93KGludGVyYWN0YWJsZSwgZWxlbWVudCwgZXZlbnRUYXJnZXQpXG4gICAgICAgICAgICAgICAgICAgICYmIG1hdGNoZXNTZWxlY3RvcihlbGVtZW50LCBzZWxlY3RvciwgZWxzKSkge1xuXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldHMucHVzaChpbnRlcmFjdGFibGUpO1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50cy5wdXNoKGVsZW1lbnQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgd2hpbGUgKGVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICBpZiAoaW50ZXJhY3QuaXNTZXQoZWxlbWVudCkgJiYgaW50ZXJhY3QoZWxlbWVudCkuX2lFdmVudHNbZXZlbnRUeXBlXSkge1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXRzLnB1c2goaW50ZXJhY3QoZWxlbWVudCkpO1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50cy5wdXNoKGVsZW1lbnQpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGludGVyYWN0YWJsZXMuZm9yRWFjaFNlbGVjdG9yKGNvbGxlY3RTZWxlY3RvcnMpO1xuXG4gICAgICAgICAgICAgICAgZWxlbWVudCA9IHBhcmVudEVsZW1lbnQoZWxlbWVudCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGNyZWF0ZSB0aGUgdGFwIGV2ZW50IGV2ZW4gaWYgdGhlcmUgYXJlIG5vIGxpc3RlbmVycyBzbyB0aGF0XG4gICAgICAgICAgICAvLyBkb3VibGV0YXAgY2FuIHN0aWxsIGJlIGNyZWF0ZWQgYW5kIGZpcmVkXG4gICAgICAgICAgICBpZiAodGFyZ2V0cy5sZW5ndGggfHwgZXZlbnRUeXBlID09PSAndGFwJykge1xuICAgICAgICAgICAgICAgIHRoaXMuZmlyZVBvaW50ZXJzKHBvaW50ZXIsIGV2ZW50LCBldmVudFRhcmdldCwgdGFyZ2V0cywgZWxlbWVudHMsIGV2ZW50VHlwZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgZmlyZVBvaW50ZXJzOiBmdW5jdGlvbiAocG9pbnRlciwgZXZlbnQsIGV2ZW50VGFyZ2V0LCB0YXJnZXRzLCBlbGVtZW50cywgZXZlbnRUeXBlKSB7XG4gICAgICAgICAgICB2YXIgcG9pbnRlckluZGV4ID0gdGhpcy5tb3VzZT8gMCA6IGluZGV4T2YodGhpcy5wb2ludGVySWRzLCBnZXRQb2ludGVySWQocG9pbnRlcikpLFxuICAgICAgICAgICAgICAgIHBvaW50ZXJFdmVudCA9IHt9LFxuICAgICAgICAgICAgICAgIGksXG4gICAgICAgICAgICAgICAgLy8gZm9yIHRhcCBldmVudHNcbiAgICAgICAgICAgICAgICBpbnRlcnZhbCwgY3JlYXRlTmV3RG91YmxlVGFwO1xuXG4gICAgICAgICAgICAvLyBpZiBpdCdzIGEgZG91YmxldGFwIHRoZW4gdGhlIGV2ZW50IHByb3BlcnRpZXMgd291bGQgaGF2ZSBiZWVuXG4gICAgICAgICAgICAvLyBjb3BpZWQgZnJvbSB0aGUgdGFwIGV2ZW50IGFuZCBwcm92aWRlZCBhcyB0aGUgcG9pbnRlciBhcmd1bWVudFxuICAgICAgICAgICAgaWYgKGV2ZW50VHlwZSA9PT0gJ2RvdWJsZXRhcCcpIHtcbiAgICAgICAgICAgICAgICBwb2ludGVyRXZlbnQgPSBwb2ludGVyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcG9pbnRlckV4dGVuZChwb2ludGVyRXZlbnQsIGV2ZW50KTtcbiAgICAgICAgICAgICAgICBpZiAoZXZlbnQgIT09IHBvaW50ZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgcG9pbnRlckV4dGVuZChwb2ludGVyRXZlbnQsIHBvaW50ZXIpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHBvaW50ZXJFdmVudC5wcmV2ZW50RGVmYXVsdCAgICAgICAgICAgPSBwcmV2ZW50T3JpZ2luYWxEZWZhdWx0O1xuICAgICAgICAgICAgICAgIHBvaW50ZXJFdmVudC5zdG9wUHJvcGFnYXRpb24gICAgICAgICAgPSBJbnRlcmFjdEV2ZW50LnByb3RvdHlwZS5zdG9wUHJvcGFnYXRpb247XG4gICAgICAgICAgICAgICAgcG9pbnRlckV2ZW50LnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbiA9IEludGVyYWN0RXZlbnQucHJvdG90eXBlLnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbjtcbiAgICAgICAgICAgICAgICBwb2ludGVyRXZlbnQuaW50ZXJhY3Rpb24gICAgICAgICAgICAgID0gdGhpcztcblxuICAgICAgICAgICAgICAgIHBvaW50ZXJFdmVudC50aW1lU3RhbXAgICAgICAgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICAgICAgICAgICAgICBwb2ludGVyRXZlbnQub3JpZ2luYWxFdmVudCAgID0gZXZlbnQ7XG4gICAgICAgICAgICAgICAgcG9pbnRlckV2ZW50Lm9yaWdpbmFsUG9pbnRlciA9IHBvaW50ZXI7XG4gICAgICAgICAgICAgICAgcG9pbnRlckV2ZW50LnR5cGUgICAgICAgICAgICA9IGV2ZW50VHlwZTtcbiAgICAgICAgICAgICAgICBwb2ludGVyRXZlbnQucG9pbnRlcklkICAgICAgID0gZ2V0UG9pbnRlcklkKHBvaW50ZXIpO1xuICAgICAgICAgICAgICAgIHBvaW50ZXJFdmVudC5wb2ludGVyVHlwZSAgICAgPSB0aGlzLm1vdXNlPyAnbW91c2UnIDogIXN1cHBvcnRzUG9pbnRlckV2ZW50PyAndG91Y2gnXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgOiBpc1N0cmluZyhwb2ludGVyLnBvaW50ZXJUeXBlKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA/IHBvaW50ZXIucG9pbnRlclR5cGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgOiBbLCwndG91Y2gnLCAncGVuJywgJ21vdXNlJ11bcG9pbnRlci5wb2ludGVyVHlwZV07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChldmVudFR5cGUgPT09ICd0YXAnKSB7XG4gICAgICAgICAgICAgICAgcG9pbnRlckV2ZW50LmR0ID0gcG9pbnRlckV2ZW50LnRpbWVTdGFtcCAtIHRoaXMuZG93blRpbWVzW3BvaW50ZXJJbmRleF07XG5cbiAgICAgICAgICAgICAgICBpbnRlcnZhbCA9IHBvaW50ZXJFdmVudC50aW1lU3RhbXAgLSB0aGlzLnRhcFRpbWU7XG4gICAgICAgICAgICAgICAgY3JlYXRlTmV3RG91YmxlVGFwID0gISEodGhpcy5wcmV2VGFwICYmIHRoaXMucHJldlRhcC50eXBlICE9PSAnZG91YmxldGFwJ1xuICAgICAgICAgICAgICAgICAgICAgICAmJiB0aGlzLnByZXZUYXAudGFyZ2V0ID09PSBwb2ludGVyRXZlbnQudGFyZ2V0XG4gICAgICAgICAgICAgICAgICAgICAgICYmIGludGVydmFsIDwgNTAwKTtcblxuICAgICAgICAgICAgICAgIHBvaW50ZXJFdmVudC5kb3VibGUgPSBjcmVhdGVOZXdEb3VibGVUYXA7XG5cbiAgICAgICAgICAgICAgICB0aGlzLnRhcFRpbWUgPSBwb2ludGVyRXZlbnQudGltZVN0YW1wO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgdGFyZ2V0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIHBvaW50ZXJFdmVudC5jdXJyZW50VGFyZ2V0ID0gZWxlbWVudHNbaV07XG4gICAgICAgICAgICAgICAgcG9pbnRlckV2ZW50LmludGVyYWN0YWJsZSA9IHRhcmdldHNbaV07XG4gICAgICAgICAgICAgICAgdGFyZ2V0c1tpXS5maXJlKHBvaW50ZXJFdmVudCk7XG5cbiAgICAgICAgICAgICAgICBpZiAocG9pbnRlckV2ZW50LmltbWVkaWF0ZVByb3BhZ2F0aW9uU3RvcHBlZFxuICAgICAgICAgICAgICAgICAgICB8fChwb2ludGVyRXZlbnQucHJvcGFnYXRpb25TdG9wcGVkICYmIGVsZW1lbnRzW2kgKyAxXSAhPT0gcG9pbnRlckV2ZW50LmN1cnJlbnRUYXJnZXQpKSB7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGNyZWF0ZU5ld0RvdWJsZVRhcCkge1xuICAgICAgICAgICAgICAgIHZhciBkb3VibGVUYXAgPSB7fTtcblxuICAgICAgICAgICAgICAgIGV4dGVuZChkb3VibGVUYXAsIHBvaW50ZXJFdmVudCk7XG5cbiAgICAgICAgICAgICAgICBkb3VibGVUYXAuZHQgICA9IGludGVydmFsO1xuICAgICAgICAgICAgICAgIGRvdWJsZVRhcC50eXBlID0gJ2RvdWJsZXRhcCc7XG5cbiAgICAgICAgICAgICAgICB0aGlzLmNvbGxlY3RFdmVudFRhcmdldHMoZG91YmxlVGFwLCBldmVudCwgZXZlbnRUYXJnZXQsICdkb3VibGV0YXAnKTtcblxuICAgICAgICAgICAgICAgIHRoaXMucHJldlRhcCA9IGRvdWJsZVRhcDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGV2ZW50VHlwZSA9PT0gJ3RhcCcpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnByZXZUYXAgPSBwb2ludGVyRXZlbnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgdmFsaWRhdGVTZWxlY3RvcjogZnVuY3Rpb24gKHBvaW50ZXIsIGV2ZW50LCBtYXRjaGVzLCBtYXRjaEVsZW1lbnRzKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gbWF0Y2hlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgICAgICAgIHZhciBtYXRjaCA9IG1hdGNoZXNbaV0sXG4gICAgICAgICAgICAgICAgICAgIG1hdGNoRWxlbWVudCA9IG1hdGNoRWxlbWVudHNbaV0sXG4gICAgICAgICAgICAgICAgICAgIGFjdGlvbiA9IHZhbGlkYXRlQWN0aW9uKG1hdGNoLmdldEFjdGlvbihwb2ludGVyLCBldmVudCwgdGhpcywgbWF0Y2hFbGVtZW50KSwgbWF0Y2gpO1xuXG4gICAgICAgICAgICAgICAgaWYgKGFjdGlvbiAmJiB3aXRoaW5JbnRlcmFjdGlvbkxpbWl0KG1hdGNoLCBtYXRjaEVsZW1lbnQsIGFjdGlvbikpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50YXJnZXQgPSBtYXRjaDtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbGVtZW50ID0gbWF0Y2hFbGVtZW50O1xuXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBhY3Rpb247XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIHNldFNuYXBwaW5nOiBmdW5jdGlvbiAocGFnZUNvb3Jkcywgc3RhdHVzKSB7XG4gICAgICAgICAgICB2YXIgc25hcCA9IHRoaXMudGFyZ2V0Lm9wdGlvbnNbdGhpcy5wcmVwYXJlZC5uYW1lXS5zbmFwLFxuICAgICAgICAgICAgICAgIHRhcmdldHMgPSBbXSxcbiAgICAgICAgICAgICAgICB0YXJnZXQsXG4gICAgICAgICAgICAgICAgcGFnZSxcbiAgICAgICAgICAgICAgICBpO1xuXG4gICAgICAgICAgICBzdGF0dXMgPSBzdGF0dXMgfHwgdGhpcy5zbmFwU3RhdHVzO1xuXG4gICAgICAgICAgICBpZiAoc3RhdHVzLnVzZVN0YXR1c1hZKSB7XG4gICAgICAgICAgICAgICAgcGFnZSA9IHsgeDogc3RhdHVzLngsIHk6IHN0YXR1cy55IH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgb3JpZ2luID0gZ2V0T3JpZ2luWFkodGhpcy50YXJnZXQsIHRoaXMuZWxlbWVudCk7XG5cbiAgICAgICAgICAgICAgICBwYWdlID0gZXh0ZW5kKHt9LCBwYWdlQ29vcmRzKTtcblxuICAgICAgICAgICAgICAgIHBhZ2UueCAtPSBvcmlnaW4ueDtcbiAgICAgICAgICAgICAgICBwYWdlLnkgLT0gb3JpZ2luLnk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHN0YXR1cy5yZWFsWCA9IHBhZ2UueDtcbiAgICAgICAgICAgIHN0YXR1cy5yZWFsWSA9IHBhZ2UueTtcblxuICAgICAgICAgICAgcGFnZS54ID0gcGFnZS54IC0gdGhpcy5pbmVydGlhU3RhdHVzLnJlc3VtZUR4O1xuICAgICAgICAgICAgcGFnZS55ID0gcGFnZS55IC0gdGhpcy5pbmVydGlhU3RhdHVzLnJlc3VtZUR5O1xuXG4gICAgICAgICAgICB2YXIgbGVuID0gc25hcC50YXJnZXRzPyBzbmFwLnRhcmdldHMubGVuZ3RoIDogMDtcblxuICAgICAgICAgICAgZm9yICh2YXIgcmVsSW5kZXggPSAwOyByZWxJbmRleCA8IHRoaXMuc25hcE9mZnNldHMubGVuZ3RoOyByZWxJbmRleCsrKSB7XG4gICAgICAgICAgICAgICAgdmFyIHJlbGF0aXZlID0ge1xuICAgICAgICAgICAgICAgICAgICB4OiBwYWdlLnggLSB0aGlzLnNuYXBPZmZzZXRzW3JlbEluZGV4XS54LFxuICAgICAgICAgICAgICAgICAgICB5OiBwYWdlLnkgLSB0aGlzLnNuYXBPZmZzZXRzW3JlbEluZGV4XS55XG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoaXNGdW5jdGlvbihzbmFwLnRhcmdldHNbaV0pKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXQgPSBzbmFwLnRhcmdldHNbaV0ocmVsYXRpdmUueCwgcmVsYXRpdmUueSwgdGhpcyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXQgPSBzbmFwLnRhcmdldHNbaV07XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAoIXRhcmdldCkgeyBjb250aW51ZTsgfVxuXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldHMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICB4OiBpc051bWJlcih0YXJnZXQueCkgPyAodGFyZ2V0LnggKyB0aGlzLnNuYXBPZmZzZXRzW3JlbEluZGV4XS54KSA6IHJlbGF0aXZlLngsXG4gICAgICAgICAgICAgICAgICAgICAgICB5OiBpc051bWJlcih0YXJnZXQueSkgPyAodGFyZ2V0LnkgKyB0aGlzLnNuYXBPZmZzZXRzW3JlbEluZGV4XS55KSA6IHJlbGF0aXZlLnksXG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHJhbmdlOiBpc051bWJlcih0YXJnZXQucmFuZ2UpPyB0YXJnZXQucmFuZ2U6IHNuYXAucmFuZ2VcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgY2xvc2VzdCA9IHtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0OiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBpblJhbmdlOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZGlzdGFuY2U6IDAsXG4gICAgICAgICAgICAgICAgICAgIHJhbmdlOiAwLFxuICAgICAgICAgICAgICAgICAgICBkeDogMCxcbiAgICAgICAgICAgICAgICAgICAgZHk6IDBcbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBmb3IgKGkgPSAwLCBsZW4gPSB0YXJnZXRzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgdGFyZ2V0ID0gdGFyZ2V0c1tpXTtcblxuICAgICAgICAgICAgICAgIHZhciByYW5nZSA9IHRhcmdldC5yYW5nZSxcbiAgICAgICAgICAgICAgICAgICAgZHggPSB0YXJnZXQueCAtIHBhZ2UueCxcbiAgICAgICAgICAgICAgICAgICAgZHkgPSB0YXJnZXQueSAtIHBhZ2UueSxcbiAgICAgICAgICAgICAgICAgICAgZGlzdGFuY2UgPSBoeXBvdChkeCwgZHkpLFxuICAgICAgICAgICAgICAgICAgICBpblJhbmdlID0gZGlzdGFuY2UgPD0gcmFuZ2U7XG5cbiAgICAgICAgICAgICAgICAvLyBJbmZpbml0ZSB0YXJnZXRzIGNvdW50IGFzIGJlaW5nIG91dCBvZiByYW5nZVxuICAgICAgICAgICAgICAgIC8vIGNvbXBhcmVkIHRvIG5vbiBpbmZpbml0ZSBvbmVzIHRoYXQgYXJlIGluIHJhbmdlXG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlID09PSBJbmZpbml0eSAmJiBjbG9zZXN0LmluUmFuZ2UgJiYgY2xvc2VzdC5yYW5nZSAhPT0gSW5maW5pdHkpIHtcbiAgICAgICAgICAgICAgICAgICAgaW5SYW5nZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICghY2xvc2VzdC50YXJnZXQgfHwgKGluUmFuZ2VcbiAgICAgICAgICAgICAgICAgICAgLy8gaXMgdGhlIGNsb3Nlc3QgdGFyZ2V0IGluIHJhbmdlP1xuICAgICAgICAgICAgICAgICAgICA/IChjbG9zZXN0LmluUmFuZ2UgJiYgcmFuZ2UgIT09IEluZmluaXR5XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGUgcG9pbnRlciBpcyByZWxhdGl2ZWx5IGRlZXBlciBpbiB0aGlzIHRhcmdldFxuICAgICAgICAgICAgICAgICAgICAgICAgPyBkaXN0YW5jZSAvIHJhbmdlIDwgY2xvc2VzdC5kaXN0YW5jZSAvIGNsb3Nlc3QucmFuZ2VcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoaXMgdGFyZ2V0IGhhcyBJbmZpbml0ZSByYW5nZSBhbmQgdGhlIGNsb3Nlc3QgZG9lc24ndFxuICAgICAgICAgICAgICAgICAgICAgICAgOiAocmFuZ2UgPT09IEluZmluaXR5ICYmIGNsb3Nlc3QucmFuZ2UgIT09IEluZmluaXR5KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIE9SIHRoaXMgdGFyZ2V0IGlzIGNsb3NlciB0aGF0IHRoZSBwcmV2aW91cyBjbG9zZXN0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfHwgZGlzdGFuY2UgPCBjbG9zZXN0LmRpc3RhbmNlKVxuICAgICAgICAgICAgICAgICAgICAvLyBUaGUgb3RoZXIgaXMgbm90IGluIHJhbmdlIGFuZCB0aGUgcG9pbnRlciBpcyBjbG9zZXIgdG8gdGhpcyB0YXJnZXRcbiAgICAgICAgICAgICAgICAgICAgOiAoIWNsb3Nlc3QuaW5SYW5nZSAmJiBkaXN0YW5jZSA8IGNsb3Nlc3QuZGlzdGFuY2UpKSkge1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChyYW5nZSA9PT0gSW5maW5pdHkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGluUmFuZ2UgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgY2xvc2VzdC50YXJnZXQgPSB0YXJnZXQ7XG4gICAgICAgICAgICAgICAgICAgIGNsb3Nlc3QuZGlzdGFuY2UgPSBkaXN0YW5jZTtcbiAgICAgICAgICAgICAgICAgICAgY2xvc2VzdC5yYW5nZSA9IHJhbmdlO1xuICAgICAgICAgICAgICAgICAgICBjbG9zZXN0LmluUmFuZ2UgPSBpblJhbmdlO1xuICAgICAgICAgICAgICAgICAgICBjbG9zZXN0LmR4ID0gZHg7XG4gICAgICAgICAgICAgICAgICAgIGNsb3Nlc3QuZHkgPSBkeTtcblxuICAgICAgICAgICAgICAgICAgICBzdGF0dXMucmFuZ2UgPSByYW5nZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBzbmFwQ2hhbmdlZDtcblxuICAgICAgICAgICAgaWYgKGNsb3Nlc3QudGFyZ2V0KSB7XG4gICAgICAgICAgICAgICAgc25hcENoYW5nZWQgPSAoc3RhdHVzLnNuYXBwZWRYICE9PSBjbG9zZXN0LnRhcmdldC54IHx8IHN0YXR1cy5zbmFwcGVkWSAhPT0gY2xvc2VzdC50YXJnZXQueSk7XG5cbiAgICAgICAgICAgICAgICBzdGF0dXMuc25hcHBlZFggPSBjbG9zZXN0LnRhcmdldC54O1xuICAgICAgICAgICAgICAgIHN0YXR1cy5zbmFwcGVkWSA9IGNsb3Nlc3QudGFyZ2V0Lnk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBzbmFwQ2hhbmdlZCA9IHRydWU7XG5cbiAgICAgICAgICAgICAgICBzdGF0dXMuc25hcHBlZFggPSBOYU47XG4gICAgICAgICAgICAgICAgc3RhdHVzLnNuYXBwZWRZID0gTmFOO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBzdGF0dXMuZHggPSBjbG9zZXN0LmR4O1xuICAgICAgICAgICAgc3RhdHVzLmR5ID0gY2xvc2VzdC5keTtcblxuICAgICAgICAgICAgc3RhdHVzLmNoYW5nZWQgPSAoc25hcENoYW5nZWQgfHwgKGNsb3Nlc3QuaW5SYW5nZSAmJiAhc3RhdHVzLmxvY2tlZCkpO1xuICAgICAgICAgICAgc3RhdHVzLmxvY2tlZCA9IGNsb3Nlc3QuaW5SYW5nZTtcblxuICAgICAgICAgICAgcmV0dXJuIHN0YXR1cztcbiAgICAgICAgfSxcblxuICAgICAgICBzZXRSZXN0cmljdGlvbjogZnVuY3Rpb24gKHBhZ2VDb29yZHMsIHN0YXR1cykge1xuICAgICAgICAgICAgdmFyIHRhcmdldCA9IHRoaXMudGFyZ2V0LFxuICAgICAgICAgICAgICAgIHJlc3RyaWN0ID0gdGFyZ2V0ICYmIHRhcmdldC5vcHRpb25zW3RoaXMucHJlcGFyZWQubmFtZV0ucmVzdHJpY3QsXG4gICAgICAgICAgICAgICAgcmVzdHJpY3Rpb24gPSByZXN0cmljdCAmJiByZXN0cmljdC5yZXN0cmljdGlvbixcbiAgICAgICAgICAgICAgICBwYWdlO1xuXG4gICAgICAgICAgICBpZiAoIXJlc3RyaWN0aW9uKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHN0YXR1cztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgc3RhdHVzID0gc3RhdHVzIHx8IHRoaXMucmVzdHJpY3RTdGF0dXM7XG5cbiAgICAgICAgICAgIHBhZ2UgPSBzdGF0dXMudXNlU3RhdHVzWFlcbiAgICAgICAgICAgICAgICAgICAgPyBwYWdlID0geyB4OiBzdGF0dXMueCwgeTogc3RhdHVzLnkgfVxuICAgICAgICAgICAgICAgICAgICA6IHBhZ2UgPSBleHRlbmQoe30sIHBhZ2VDb29yZHMpO1xuXG4gICAgICAgICAgICBpZiAoc3RhdHVzLnNuYXAgJiYgc3RhdHVzLnNuYXAubG9ja2VkKSB7XG4gICAgICAgICAgICAgICAgcGFnZS54ICs9IHN0YXR1cy5zbmFwLmR4IHx8IDA7XG4gICAgICAgICAgICAgICAgcGFnZS55ICs9IHN0YXR1cy5zbmFwLmR5IHx8IDA7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHBhZ2UueCAtPSB0aGlzLmluZXJ0aWFTdGF0dXMucmVzdW1lRHg7XG4gICAgICAgICAgICBwYWdlLnkgLT0gdGhpcy5pbmVydGlhU3RhdHVzLnJlc3VtZUR5O1xuXG4gICAgICAgICAgICBzdGF0dXMuZHggPSAwO1xuICAgICAgICAgICAgc3RhdHVzLmR5ID0gMDtcbiAgICAgICAgICAgIHN0YXR1cy5yZXN0cmljdGVkID0gZmFsc2U7XG5cbiAgICAgICAgICAgIHZhciByZWN0LCByZXN0cmljdGVkWCwgcmVzdHJpY3RlZFk7XG5cbiAgICAgICAgICAgIGlmIChpc1N0cmluZyhyZXN0cmljdGlvbikpIHtcbiAgICAgICAgICAgICAgICBpZiAocmVzdHJpY3Rpb24gPT09ICdwYXJlbnQnKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3RyaWN0aW9uID0gcGFyZW50RWxlbWVudCh0aGlzLmVsZW1lbnQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChyZXN0cmljdGlvbiA9PT0gJ3NlbGYnKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3RyaWN0aW9uID0gdGFyZ2V0LmdldFJlY3QodGhpcy5lbGVtZW50KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3RyaWN0aW9uID0gY2xvc2VzdCh0aGlzLmVsZW1lbnQsIHJlc3RyaWN0aW9uKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoIXJlc3RyaWN0aW9uKSB7IHJldHVybiBzdGF0dXM7IH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGlzRnVuY3Rpb24ocmVzdHJpY3Rpb24pKSB7XG4gICAgICAgICAgICAgICAgcmVzdHJpY3Rpb24gPSByZXN0cmljdGlvbihwYWdlLngsIHBhZ2UueSwgdGhpcy5lbGVtZW50KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGlzRWxlbWVudChyZXN0cmljdGlvbikpIHtcbiAgICAgICAgICAgICAgICByZXN0cmljdGlvbiA9IGdldEVsZW1lbnRSZWN0KHJlc3RyaWN0aW9uKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmVjdCA9IHJlc3RyaWN0aW9uO1xuXG4gICAgICAgICAgICBpZiAoIXJlc3RyaWN0aW9uKSB7XG4gICAgICAgICAgICAgICAgcmVzdHJpY3RlZFggPSBwYWdlLng7XG4gICAgICAgICAgICAgICAgcmVzdHJpY3RlZFkgPSBwYWdlLnk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBvYmplY3QgaXMgYXNzdW1lZCB0byBoYXZlXG4gICAgICAgICAgICAvLyB4LCB5LCB3aWR0aCwgaGVpZ2h0IG9yXG4gICAgICAgICAgICAvLyBsZWZ0LCB0b3AsIHJpZ2h0LCBib3R0b21cbiAgICAgICAgICAgIGVsc2UgaWYgKCd4JyBpbiByZXN0cmljdGlvbiAmJiAneScgaW4gcmVzdHJpY3Rpb24pIHtcbiAgICAgICAgICAgICAgICByZXN0cmljdGVkWCA9IE1hdGgubWF4KE1hdGgubWluKHJlY3QueCArIHJlY3Qud2lkdGggIC0gdGhpcy5yZXN0cmljdE9mZnNldC5yaWdodCAsIHBhZ2UueCksIHJlY3QueCArIHRoaXMucmVzdHJpY3RPZmZzZXQubGVmdCk7XG4gICAgICAgICAgICAgICAgcmVzdHJpY3RlZFkgPSBNYXRoLm1heChNYXRoLm1pbihyZWN0LnkgKyByZWN0LmhlaWdodCAtIHRoaXMucmVzdHJpY3RPZmZzZXQuYm90dG9tLCBwYWdlLnkpLCByZWN0LnkgKyB0aGlzLnJlc3RyaWN0T2Zmc2V0LnRvcCApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcmVzdHJpY3RlZFggPSBNYXRoLm1heChNYXRoLm1pbihyZWN0LnJpZ2h0ICAtIHRoaXMucmVzdHJpY3RPZmZzZXQucmlnaHQgLCBwYWdlLngpLCByZWN0LmxlZnQgKyB0aGlzLnJlc3RyaWN0T2Zmc2V0LmxlZnQpO1xuICAgICAgICAgICAgICAgIHJlc3RyaWN0ZWRZID0gTWF0aC5tYXgoTWF0aC5taW4ocmVjdC5ib3R0b20gLSB0aGlzLnJlc3RyaWN0T2Zmc2V0LmJvdHRvbSwgcGFnZS55KSwgcmVjdC50b3AgICsgdGhpcy5yZXN0cmljdE9mZnNldC50b3AgKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgc3RhdHVzLmR4ID0gcmVzdHJpY3RlZFggLSBwYWdlLng7XG4gICAgICAgICAgICBzdGF0dXMuZHkgPSByZXN0cmljdGVkWSAtIHBhZ2UueTtcblxuICAgICAgICAgICAgc3RhdHVzLmNoYW5nZWQgPSBzdGF0dXMucmVzdHJpY3RlZFggIT09IHJlc3RyaWN0ZWRYIHx8IHN0YXR1cy5yZXN0cmljdGVkWSAhPT0gcmVzdHJpY3RlZFk7XG4gICAgICAgICAgICBzdGF0dXMucmVzdHJpY3RlZCA9ICEhKHN0YXR1cy5keCB8fCBzdGF0dXMuZHkpO1xuXG4gICAgICAgICAgICBzdGF0dXMucmVzdHJpY3RlZFggPSByZXN0cmljdGVkWDtcbiAgICAgICAgICAgIHN0YXR1cy5yZXN0cmljdGVkWSA9IHJlc3RyaWN0ZWRZO1xuXG4gICAgICAgICAgICByZXR1cm4gc3RhdHVzO1xuICAgICAgICB9LFxuXG4gICAgICAgIGNoZWNrQW5kUHJldmVudERlZmF1bHQ6IGZ1bmN0aW9uIChldmVudCwgaW50ZXJhY3RhYmxlLCBlbGVtZW50KSB7XG4gICAgICAgICAgICBpZiAoIShpbnRlcmFjdGFibGUgPSBpbnRlcmFjdGFibGUgfHwgdGhpcy50YXJnZXQpKSB7IHJldHVybjsgfVxuXG4gICAgICAgICAgICB2YXIgb3B0aW9ucyA9IGludGVyYWN0YWJsZS5vcHRpb25zLFxuICAgICAgICAgICAgICAgIHByZXZlbnQgPSBvcHRpb25zLnByZXZlbnREZWZhdWx0O1xuXG4gICAgICAgICAgICBpZiAocHJldmVudCA9PT0gJ2F1dG8nICYmIGVsZW1lbnQgJiYgIS9eKGlucHV0fHNlbGVjdHx0ZXh0YXJlYSkkL2kudGVzdChldmVudC50YXJnZXQubm9kZU5hbWUpKSB7XG4gICAgICAgICAgICAgICAgLy8gZG8gbm90IHByZXZlbnREZWZhdWx0IG9uIHBvaW50ZXJkb3duIGlmIHRoZSBwcmVwYXJlZCBhY3Rpb24gaXMgYSBkcmFnXG4gICAgICAgICAgICAgICAgLy8gYW5kIGRyYWdnaW5nIGNhbiBvbmx5IHN0YXJ0IGZyb20gYSBjZXJ0YWluIGRpcmVjdGlvbiAtIHRoaXMgYWxsb3dzXG4gICAgICAgICAgICAgICAgLy8gYSB0b3VjaCB0byBwYW4gdGhlIHZpZXdwb3J0IGlmIGEgZHJhZyBpc24ndCBpbiB0aGUgcmlnaHQgZGlyZWN0aW9uXG4gICAgICAgICAgICAgICAgaWYgKC9kb3dufHN0YXJ0L2kudGVzdChldmVudC50eXBlKVxuICAgICAgICAgICAgICAgICAgICAmJiB0aGlzLnByZXBhcmVkLm5hbWUgPT09ICdkcmFnJyAmJiBvcHRpb25zLmRyYWcuYXhpcyAhPT0gJ3h5Jykge1xuXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyB3aXRoIG1hbnVhbFN0YXJ0LCBvbmx5IHByZXZlbnREZWZhdWx0IHdoaWxlIGludGVyYWN0aW5nXG4gICAgICAgICAgICAgICAgaWYgKG9wdGlvbnNbdGhpcy5wcmVwYXJlZC5uYW1lXSAmJiBvcHRpb25zW3RoaXMucHJlcGFyZWQubmFtZV0ubWFudWFsU3RhcnRcbiAgICAgICAgICAgICAgICAgICAgJiYgIXRoaXMuaW50ZXJhY3RpbmcoKSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChwcmV2ZW50ID09PSAnYWx3YXlzJykge1xuICAgICAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIGNhbGNJbmVydGlhOiBmdW5jdGlvbiAoc3RhdHVzKSB7XG4gICAgICAgICAgICB2YXIgaW5lcnRpYU9wdGlvbnMgPSB0aGlzLnRhcmdldC5vcHRpb25zW3RoaXMucHJlcGFyZWQubmFtZV0uaW5lcnRpYSxcbiAgICAgICAgICAgICAgICBsYW1iZGEgPSBpbmVydGlhT3B0aW9ucy5yZXNpc3RhbmNlLFxuICAgICAgICAgICAgICAgIGluZXJ0aWFEdXIgPSAtTWF0aC5sb2coaW5lcnRpYU9wdGlvbnMuZW5kU3BlZWQgLyBzdGF0dXMudjApIC8gbGFtYmRhO1xuXG4gICAgICAgICAgICBzdGF0dXMueDAgPSB0aGlzLnByZXZFdmVudC5wYWdlWDtcbiAgICAgICAgICAgIHN0YXR1cy55MCA9IHRoaXMucHJldkV2ZW50LnBhZ2VZO1xuICAgICAgICAgICAgc3RhdHVzLnQwID0gc3RhdHVzLnN0YXJ0RXZlbnQudGltZVN0YW1wIC8gMTAwMDtcbiAgICAgICAgICAgIHN0YXR1cy5zeCA9IHN0YXR1cy5zeSA9IDA7XG5cbiAgICAgICAgICAgIHN0YXR1cy5tb2RpZmllZFhlID0gc3RhdHVzLnhlID0gKHN0YXR1cy52eDAgLSBpbmVydGlhRHVyKSAvIGxhbWJkYTtcbiAgICAgICAgICAgIHN0YXR1cy5tb2RpZmllZFllID0gc3RhdHVzLnllID0gKHN0YXR1cy52eTAgLSBpbmVydGlhRHVyKSAvIGxhbWJkYTtcbiAgICAgICAgICAgIHN0YXR1cy50ZSA9IGluZXJ0aWFEdXI7XG5cbiAgICAgICAgICAgIHN0YXR1cy5sYW1iZGFfdjAgPSBsYW1iZGEgLyBzdGF0dXMudjA7XG4gICAgICAgICAgICBzdGF0dXMub25lX3ZlX3YwID0gMSAtIGluZXJ0aWFPcHRpb25zLmVuZFNwZWVkIC8gc3RhdHVzLnYwO1xuICAgICAgICB9LFxuXG4gICAgICAgIGF1dG9TY3JvbGxNb3ZlOiBmdW5jdGlvbiAocG9pbnRlcikge1xuICAgICAgICAgICAgaWYgKCEodGhpcy5pbnRlcmFjdGluZygpXG4gICAgICAgICAgICAgICAgJiYgY2hlY2tBdXRvU2Nyb2xsKHRoaXMudGFyZ2V0LCB0aGlzLnByZXBhcmVkLm5hbWUpKSkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRoaXMuaW5lcnRpYVN0YXR1cy5hY3RpdmUpIHtcbiAgICAgICAgICAgICAgICBhdXRvU2Nyb2xsLnggPSBhdXRvU2Nyb2xsLnkgPSAwO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHRvcCxcbiAgICAgICAgICAgICAgICByaWdodCxcbiAgICAgICAgICAgICAgICBib3R0b20sXG4gICAgICAgICAgICAgICAgbGVmdCxcbiAgICAgICAgICAgICAgICBvcHRpb25zID0gdGhpcy50YXJnZXQub3B0aW9uc1t0aGlzLnByZXBhcmVkLm5hbWVdLmF1dG9TY3JvbGwsXG4gICAgICAgICAgICAgICAgY29udGFpbmVyID0gb3B0aW9ucy5jb250YWluZXIgfHwgZ2V0V2luZG93KHRoaXMuZWxlbWVudCk7XG5cbiAgICAgICAgICAgIGlmIChpc1dpbmRvdyhjb250YWluZXIpKSB7XG4gICAgICAgICAgICAgICAgbGVmdCAgID0gcG9pbnRlci5jbGllbnRYIDwgYXV0b1Njcm9sbC5tYXJnaW47XG4gICAgICAgICAgICAgICAgdG9wICAgID0gcG9pbnRlci5jbGllbnRZIDwgYXV0b1Njcm9sbC5tYXJnaW47XG4gICAgICAgICAgICAgICAgcmlnaHQgID0gcG9pbnRlci5jbGllbnRYID4gY29udGFpbmVyLmlubmVyV2lkdGggIC0gYXV0b1Njcm9sbC5tYXJnaW47XG4gICAgICAgICAgICAgICAgYm90dG9tID0gcG9pbnRlci5jbGllbnRZID4gY29udGFpbmVyLmlubmVySGVpZ2h0IC0gYXV0b1Njcm9sbC5tYXJnaW47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgcmVjdCA9IGdldEVsZW1lbnRDbGllbnRSZWN0KGNvbnRhaW5lcik7XG5cbiAgICAgICAgICAgICAgICBsZWZ0ICAgPSBwb2ludGVyLmNsaWVudFggPCByZWN0LmxlZnQgICArIGF1dG9TY3JvbGwubWFyZ2luO1xuICAgICAgICAgICAgICAgIHRvcCAgICA9IHBvaW50ZXIuY2xpZW50WSA8IHJlY3QudG9wICAgICsgYXV0b1Njcm9sbC5tYXJnaW47XG4gICAgICAgICAgICAgICAgcmlnaHQgID0gcG9pbnRlci5jbGllbnRYID4gcmVjdC5yaWdodCAgLSBhdXRvU2Nyb2xsLm1hcmdpbjtcbiAgICAgICAgICAgICAgICBib3R0b20gPSBwb2ludGVyLmNsaWVudFkgPiByZWN0LmJvdHRvbSAtIGF1dG9TY3JvbGwubWFyZ2luO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBhdXRvU2Nyb2xsLnggPSAocmlnaHQgPyAxOiBsZWZ0PyAtMTogMCk7XG4gICAgICAgICAgICBhdXRvU2Nyb2xsLnkgPSAoYm90dG9tPyAxOiAgdG9wPyAtMTogMCk7XG5cbiAgICAgICAgICAgIGlmICghYXV0b1Njcm9sbC5pc1Njcm9sbGluZykge1xuICAgICAgICAgICAgICAgIC8vIHNldCB0aGUgYXV0b1Njcm9sbCBwcm9wZXJ0aWVzIHRvIHRob3NlIG9mIHRoZSB0YXJnZXRcbiAgICAgICAgICAgICAgICBhdXRvU2Nyb2xsLm1hcmdpbiA9IG9wdGlvbnMubWFyZ2luO1xuICAgICAgICAgICAgICAgIGF1dG9TY3JvbGwuc3BlZWQgID0gb3B0aW9ucy5zcGVlZDtcblxuICAgICAgICAgICAgICAgIGF1dG9TY3JvbGwuc3RhcnQodGhpcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgX3VwZGF0ZUV2ZW50VGFyZ2V0czogZnVuY3Rpb24gKHRhcmdldCwgY3VycmVudFRhcmdldCkge1xuICAgICAgICAgICAgdGhpcy5fZXZlbnRUYXJnZXQgICAgPSB0YXJnZXQ7XG4gICAgICAgICAgICB0aGlzLl9jdXJFdmVudFRhcmdldCA9IGN1cnJlbnRUYXJnZXQ7XG4gICAgICAgIH1cblxuICAgIH07XG5cbiAgICBmdW5jdGlvbiBnZXRJbnRlcmFjdGlvbkZyb21Qb2ludGVyIChwb2ludGVyLCBldmVudFR5cGUsIGV2ZW50VGFyZ2V0KSB7XG4gICAgICAgIHZhciBpID0gMCwgbGVuID0gaW50ZXJhY3Rpb25zLmxlbmd0aCxcbiAgICAgICAgICAgIG1vdXNlRXZlbnQgPSAoL21vdXNlL2kudGVzdChwb2ludGVyLnBvaW50ZXJUeXBlIHx8IGV2ZW50VHlwZSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gTVNQb2ludGVyRXZlbnQuTVNQT0lOVEVSX1RZUEVfTU9VU0VcbiAgICAgICAgICAgICAgICAgICAgICAgICAgfHwgcG9pbnRlci5wb2ludGVyVHlwZSA9PT0gNCksXG4gICAgICAgICAgICBpbnRlcmFjdGlvbjtcblxuICAgICAgICB2YXIgaWQgPSBnZXRQb2ludGVySWQocG9pbnRlcik7XG5cbiAgICAgICAgLy8gdHJ5IHRvIHJlc3VtZSBpbmVydGlhIHdpdGggYSBuZXcgcG9pbnRlclxuICAgICAgICBpZiAoL2Rvd258c3RhcnQvaS50ZXN0KGV2ZW50VHlwZSkpIHtcbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgICAgICAgIGludGVyYWN0aW9uID0gaW50ZXJhY3Rpb25zW2ldO1xuXG4gICAgICAgICAgICAgICAgdmFyIGVsZW1lbnQgPSBldmVudFRhcmdldDtcblxuICAgICAgICAgICAgICAgIGlmIChpbnRlcmFjdGlvbi5pbmVydGlhU3RhdHVzLmFjdGl2ZSAmJiBpbnRlcmFjdGlvbi50YXJnZXQub3B0aW9uc1tpbnRlcmFjdGlvbi5wcmVwYXJlZC5uYW1lXS5pbmVydGlhLmFsbG93UmVzdW1lXG4gICAgICAgICAgICAgICAgICAgICYmIChpbnRlcmFjdGlvbi5tb3VzZSA9PT0gbW91c2VFdmVudCkpIHtcbiAgICAgICAgICAgICAgICAgICAgd2hpbGUgKGVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlmIHRoZSBlbGVtZW50IGlzIHRoZSBpbnRlcmFjdGlvbiBlbGVtZW50XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZWxlbWVudCA9PT0gaW50ZXJhY3Rpb24uZWxlbWVudCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBpbnRlcmFjdGlvbjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnQgPSBwYXJlbnRFbGVtZW50KGVsZW1lbnQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gaWYgaXQncyBhIG1vdXNlIGludGVyYWN0aW9uXG4gICAgICAgIGlmIChtb3VzZUV2ZW50IHx8ICEoc3VwcG9ydHNUb3VjaCB8fCBzdXBwb3J0c1BvaW50ZXJFdmVudCkpIHtcblxuICAgICAgICAgICAgLy8gZmluZCBhIG1vdXNlIGludGVyYWN0aW9uIHRoYXQncyBub3QgaW4gaW5lcnRpYSBwaGFzZVxuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKGludGVyYWN0aW9uc1tpXS5tb3VzZSAmJiAhaW50ZXJhY3Rpb25zW2ldLmluZXJ0aWFTdGF0dXMuYWN0aXZlKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBpbnRlcmFjdGlvbnNbaV07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBmaW5kIGFueSBpbnRlcmFjdGlvbiBzcGVjaWZpY2FsbHkgZm9yIG1vdXNlLlxuICAgICAgICAgICAgLy8gaWYgdGhlIGV2ZW50VHlwZSBpcyBhIG1vdXNlZG93biwgYW5kIGluZXJ0aWEgaXMgYWN0aXZlXG4gICAgICAgICAgICAvLyBpZ25vcmUgdGhlIGludGVyYWN0aW9uXG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgICAgICBpZiAoaW50ZXJhY3Rpb25zW2ldLm1vdXNlICYmICEoL2Rvd24vLnRlc3QoZXZlbnRUeXBlKSAmJiBpbnRlcmFjdGlvbnNbaV0uaW5lcnRpYVN0YXR1cy5hY3RpdmUpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBpbnRlcmFjdGlvbjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGNyZWF0ZSBhIG5ldyBpbnRlcmFjdGlvbiBmb3IgbW91c2VcbiAgICAgICAgICAgIGludGVyYWN0aW9uID0gbmV3IEludGVyYWN0aW9uKCk7XG4gICAgICAgICAgICBpbnRlcmFjdGlvbi5tb3VzZSA9IHRydWU7XG5cbiAgICAgICAgICAgIHJldHVybiBpbnRlcmFjdGlvbjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGdldCBpbnRlcmFjdGlvbiB0aGF0IGhhcyB0aGlzIHBvaW50ZXJcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoY29udGFpbnMoaW50ZXJhY3Rpb25zW2ldLnBvaW50ZXJJZHMsIGlkKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBpbnRlcmFjdGlvbnNbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBhdCB0aGlzIHN0YWdlLCBhIHBvaW50ZXJVcCBzaG91bGQgbm90IHJldHVybiBhbiBpbnRlcmFjdGlvblxuICAgICAgICBpZiAoL3VwfGVuZHxvdXQvaS50ZXN0KGV2ZW50VHlwZSkpIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gZ2V0IGZpcnN0IGlkbGUgaW50ZXJhY3Rpb25cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICBpbnRlcmFjdGlvbiA9IGludGVyYWN0aW9uc1tpXTtcblxuICAgICAgICAgICAgaWYgKCghaW50ZXJhY3Rpb24ucHJlcGFyZWQubmFtZSB8fCAoaW50ZXJhY3Rpb24udGFyZ2V0Lm9wdGlvbnMuZ2VzdHVyZS5lbmFibGVkKSlcbiAgICAgICAgICAgICAgICAmJiAhaW50ZXJhY3Rpb24uaW50ZXJhY3RpbmcoKVxuICAgICAgICAgICAgICAgICYmICEoIW1vdXNlRXZlbnQgJiYgaW50ZXJhY3Rpb24ubW91c2UpKSB7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gaW50ZXJhY3Rpb247XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbmV3IEludGVyYWN0aW9uKCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZG9PbkludGVyYWN0aW9ucyAobWV0aG9kKSB7XG4gICAgICAgIHJldHVybiAoZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICB2YXIgaW50ZXJhY3Rpb24sXG4gICAgICAgICAgICAgICAgZXZlbnRUYXJnZXQgPSBnZXRBY3R1YWxFbGVtZW50KGV2ZW50LnBhdGhcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPyBldmVudC5wYXRoWzBdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDogZXZlbnQudGFyZ2V0KSxcbiAgICAgICAgICAgICAgICBjdXJFdmVudFRhcmdldCA9IGdldEFjdHVhbEVsZW1lbnQoZXZlbnQuY3VycmVudFRhcmdldCksXG4gICAgICAgICAgICAgICAgaTtcblxuICAgICAgICAgICAgaWYgKHN1cHBvcnRzVG91Y2ggJiYgL3RvdWNoLy50ZXN0KGV2ZW50LnR5cGUpKSB7XG4gICAgICAgICAgICAgICAgcHJldlRvdWNoVGltZSA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuXG4gICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGV2ZW50LmNoYW5nZWRUb3VjaGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBwb2ludGVyID0gZXZlbnQuY2hhbmdlZFRvdWNoZXNbaV07XG5cbiAgICAgICAgICAgICAgICAgICAgaW50ZXJhY3Rpb24gPSBnZXRJbnRlcmFjdGlvbkZyb21Qb2ludGVyKHBvaW50ZXIsIGV2ZW50LnR5cGUsIGV2ZW50VGFyZ2V0KTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoIWludGVyYWN0aW9uKSB7IGNvbnRpbnVlOyB9XG5cbiAgICAgICAgICAgICAgICAgICAgaW50ZXJhY3Rpb24uX3VwZGF0ZUV2ZW50VGFyZ2V0cyhldmVudFRhcmdldCwgY3VyRXZlbnRUYXJnZXQpO1xuXG4gICAgICAgICAgICAgICAgICAgIGludGVyYWN0aW9uW21ldGhvZF0ocG9pbnRlciwgZXZlbnQsIGV2ZW50VGFyZ2V0LCBjdXJFdmVudFRhcmdldCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKCFzdXBwb3J0c1BvaW50ZXJFdmVudCAmJiAvbW91c2UvLnRlc3QoZXZlbnQudHlwZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gaWdub3JlIG1vdXNlIGV2ZW50cyB3aGlsZSB0b3VjaCBpbnRlcmFjdGlvbnMgYXJlIGFjdGl2ZVxuICAgICAgICAgICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgaW50ZXJhY3Rpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWludGVyYWN0aW9uc1tpXS5tb3VzZSAmJiBpbnRlcmFjdGlvbnNbaV0ucG9pbnRlcklzRG93bikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIHRyeSB0byBpZ25vcmUgbW91c2UgZXZlbnRzIHRoYXQgYXJlIHNpbXVsYXRlZCBieSB0aGUgYnJvd3NlclxuICAgICAgICAgICAgICAgICAgICAvLyBhZnRlciBhIHRvdWNoIGV2ZW50XG4gICAgICAgICAgICAgICAgICAgIGlmIChuZXcgRGF0ZSgpLmdldFRpbWUoKSAtIHByZXZUb3VjaFRpbWUgPCA1MDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGludGVyYWN0aW9uID0gZ2V0SW50ZXJhY3Rpb25Gcm9tUG9pbnRlcihldmVudCwgZXZlbnQudHlwZSwgZXZlbnRUYXJnZXQpO1xuXG4gICAgICAgICAgICAgICAgaWYgKCFpbnRlcmFjdGlvbikgeyByZXR1cm47IH1cblxuICAgICAgICAgICAgICAgIGludGVyYWN0aW9uLl91cGRhdGVFdmVudFRhcmdldHMoZXZlbnRUYXJnZXQsIGN1ckV2ZW50VGFyZ2V0KTtcblxuICAgICAgICAgICAgICAgIGludGVyYWN0aW9uW21ldGhvZF0oZXZlbnQsIGV2ZW50LCBldmVudFRhcmdldCwgY3VyRXZlbnRUYXJnZXQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBJbnRlcmFjdEV2ZW50IChpbnRlcmFjdGlvbiwgZXZlbnQsIGFjdGlvbiwgcGhhc2UsIGVsZW1lbnQsIHJlbGF0ZWQpIHtcbiAgICAgICAgdmFyIGNsaWVudCxcbiAgICAgICAgICAgIHBhZ2UsXG4gICAgICAgICAgICB0YXJnZXQgICAgICA9IGludGVyYWN0aW9uLnRhcmdldCxcbiAgICAgICAgICAgIHNuYXBTdGF0dXMgID0gaW50ZXJhY3Rpb24uc25hcFN0YXR1cyxcbiAgICAgICAgICAgIHJlc3RyaWN0U3RhdHVzICA9IGludGVyYWN0aW9uLnJlc3RyaWN0U3RhdHVzLFxuICAgICAgICAgICAgcG9pbnRlcnMgICAgPSBpbnRlcmFjdGlvbi5wb2ludGVycyxcbiAgICAgICAgICAgIGRlbHRhU291cmNlID0gKHRhcmdldCAmJiB0YXJnZXQub3B0aW9ucyB8fCBkZWZhdWx0T3B0aW9ucykuZGVsdGFTb3VyY2UsXG4gICAgICAgICAgICBzb3VyY2VYICAgICA9IGRlbHRhU291cmNlICsgJ1gnLFxuICAgICAgICAgICAgc291cmNlWSAgICAgPSBkZWx0YVNvdXJjZSArICdZJyxcbiAgICAgICAgICAgIG9wdGlvbnMgICAgID0gdGFyZ2V0PyB0YXJnZXQub3B0aW9uczogZGVmYXVsdE9wdGlvbnMsXG4gICAgICAgICAgICBvcmlnaW4gICAgICA9IGdldE9yaWdpblhZKHRhcmdldCwgZWxlbWVudCksXG4gICAgICAgICAgICBzdGFydGluZyAgICA9IHBoYXNlID09PSAnc3RhcnQnLFxuICAgICAgICAgICAgZW5kaW5nICAgICAgPSBwaGFzZSA9PT0gJ2VuZCcsXG4gICAgICAgICAgICBjb29yZHMgICAgICA9IHN0YXJ0aW5nPyBpbnRlcmFjdGlvbi5zdGFydENvb3JkcyA6IGludGVyYWN0aW9uLmN1ckNvb3JkcztcblxuICAgICAgICBlbGVtZW50ID0gZWxlbWVudCB8fCBpbnRlcmFjdGlvbi5lbGVtZW50O1xuXG4gICAgICAgIHBhZ2UgICA9IGV4dGVuZCh7fSwgY29vcmRzLnBhZ2UpO1xuICAgICAgICBjbGllbnQgPSBleHRlbmQoe30sIGNvb3Jkcy5jbGllbnQpO1xuXG4gICAgICAgIHBhZ2UueCAtPSBvcmlnaW4ueDtcbiAgICAgICAgcGFnZS55IC09IG9yaWdpbi55O1xuXG4gICAgICAgIGNsaWVudC54IC09IG9yaWdpbi54O1xuICAgICAgICBjbGllbnQueSAtPSBvcmlnaW4ueTtcblxuICAgICAgICB2YXIgcmVsYXRpdmVQb2ludHMgPSBvcHRpb25zW2FjdGlvbl0uc25hcCAmJiBvcHRpb25zW2FjdGlvbl0uc25hcC5yZWxhdGl2ZVBvaW50cyA7XG5cbiAgICAgICAgaWYgKGNoZWNrU25hcCh0YXJnZXQsIGFjdGlvbikgJiYgIShzdGFydGluZyAmJiByZWxhdGl2ZVBvaW50cyAmJiByZWxhdGl2ZVBvaW50cy5sZW5ndGgpKSB7XG4gICAgICAgICAgICB0aGlzLnNuYXAgPSB7XG4gICAgICAgICAgICAgICAgcmFuZ2UgIDogc25hcFN0YXR1cy5yYW5nZSxcbiAgICAgICAgICAgICAgICBsb2NrZWQgOiBzbmFwU3RhdHVzLmxvY2tlZCxcbiAgICAgICAgICAgICAgICB4ICAgICAgOiBzbmFwU3RhdHVzLnNuYXBwZWRYLFxuICAgICAgICAgICAgICAgIHkgICAgICA6IHNuYXBTdGF0dXMuc25hcHBlZFksXG4gICAgICAgICAgICAgICAgcmVhbFggIDogc25hcFN0YXR1cy5yZWFsWCxcbiAgICAgICAgICAgICAgICByZWFsWSAgOiBzbmFwU3RhdHVzLnJlYWxZLFxuICAgICAgICAgICAgICAgIGR4ICAgICA6IHNuYXBTdGF0dXMuZHgsXG4gICAgICAgICAgICAgICAgZHkgICAgIDogc25hcFN0YXR1cy5keVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgaWYgKHNuYXBTdGF0dXMubG9ja2VkKSB7XG4gICAgICAgICAgICAgICAgcGFnZS54ICs9IHNuYXBTdGF0dXMuZHg7XG4gICAgICAgICAgICAgICAgcGFnZS55ICs9IHNuYXBTdGF0dXMuZHk7XG4gICAgICAgICAgICAgICAgY2xpZW50LnggKz0gc25hcFN0YXR1cy5keDtcbiAgICAgICAgICAgICAgICBjbGllbnQueSArPSBzbmFwU3RhdHVzLmR5O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNoZWNrUmVzdHJpY3QodGFyZ2V0LCBhY3Rpb24pICYmICEoc3RhcnRpbmcgJiYgb3B0aW9uc1thY3Rpb25dLnJlc3RyaWN0LmVsZW1lbnRSZWN0KSAmJiByZXN0cmljdFN0YXR1cy5yZXN0cmljdGVkKSB7XG4gICAgICAgICAgICBwYWdlLnggKz0gcmVzdHJpY3RTdGF0dXMuZHg7XG4gICAgICAgICAgICBwYWdlLnkgKz0gcmVzdHJpY3RTdGF0dXMuZHk7XG4gICAgICAgICAgICBjbGllbnQueCArPSByZXN0cmljdFN0YXR1cy5keDtcbiAgICAgICAgICAgIGNsaWVudC55ICs9IHJlc3RyaWN0U3RhdHVzLmR5O1xuXG4gICAgICAgICAgICB0aGlzLnJlc3RyaWN0ID0ge1xuICAgICAgICAgICAgICAgIGR4OiByZXN0cmljdFN0YXR1cy5keCxcbiAgICAgICAgICAgICAgICBkeTogcmVzdHJpY3RTdGF0dXMuZHlcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnBhZ2VYICAgICA9IHBhZ2UueDtcbiAgICAgICAgdGhpcy5wYWdlWSAgICAgPSBwYWdlLnk7XG4gICAgICAgIHRoaXMuY2xpZW50WCAgID0gY2xpZW50Lng7XG4gICAgICAgIHRoaXMuY2xpZW50WSAgID0gY2xpZW50Lnk7XG5cbiAgICAgICAgdGhpcy54MCAgICAgICAgPSBpbnRlcmFjdGlvbi5zdGFydENvb3Jkcy5wYWdlLnggLSBvcmlnaW4ueDtcbiAgICAgICAgdGhpcy55MCAgICAgICAgPSBpbnRlcmFjdGlvbi5zdGFydENvb3Jkcy5wYWdlLnkgLSBvcmlnaW4ueTtcbiAgICAgICAgdGhpcy5jbGllbnRYMCAgPSBpbnRlcmFjdGlvbi5zdGFydENvb3Jkcy5jbGllbnQueCAtIG9yaWdpbi54O1xuICAgICAgICB0aGlzLmNsaWVudFkwICA9IGludGVyYWN0aW9uLnN0YXJ0Q29vcmRzLmNsaWVudC55IC0gb3JpZ2luLnk7XG4gICAgICAgIHRoaXMuY3RybEtleSAgID0gZXZlbnQuY3RybEtleTtcbiAgICAgICAgdGhpcy5hbHRLZXkgICAgPSBldmVudC5hbHRLZXk7XG4gICAgICAgIHRoaXMuc2hpZnRLZXkgID0gZXZlbnQuc2hpZnRLZXk7XG4gICAgICAgIHRoaXMubWV0YUtleSAgID0gZXZlbnQubWV0YUtleTtcbiAgICAgICAgdGhpcy5idXR0b24gICAgPSBldmVudC5idXR0b247XG4gICAgICAgIHRoaXMuYnV0dG9ucyAgID0gZXZlbnQuYnV0dG9ucztcbiAgICAgICAgdGhpcy50YXJnZXQgICAgPSBlbGVtZW50O1xuICAgICAgICB0aGlzLnQwICAgICAgICA9IGludGVyYWN0aW9uLmRvd25UaW1lc1swXTtcbiAgICAgICAgdGhpcy50eXBlICAgICAgPSBhY3Rpb24gKyAocGhhc2UgfHwgJycpO1xuXG4gICAgICAgIHRoaXMuaW50ZXJhY3Rpb24gPSBpbnRlcmFjdGlvbjtcbiAgICAgICAgdGhpcy5pbnRlcmFjdGFibGUgPSB0YXJnZXQ7XG5cbiAgICAgICAgdmFyIGluZXJ0aWFTdGF0dXMgPSBpbnRlcmFjdGlvbi5pbmVydGlhU3RhdHVzO1xuXG4gICAgICAgIGlmIChpbmVydGlhU3RhdHVzLmFjdGl2ZSkge1xuICAgICAgICAgICAgdGhpcy5kZXRhaWwgPSAnaW5lcnRpYSc7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocmVsYXRlZCkge1xuICAgICAgICAgICAgdGhpcy5yZWxhdGVkVGFyZ2V0ID0gcmVsYXRlZDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGVuZCBldmVudCBkeCwgZHkgaXMgZGlmZmVyZW5jZSBiZXR3ZWVuIHN0YXJ0IGFuZCBlbmQgcG9pbnRzXG4gICAgICAgIGlmIChlbmRpbmcpIHtcbiAgICAgICAgICAgIGlmIChkZWx0YVNvdXJjZSA9PT0gJ2NsaWVudCcpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmR4ID0gY2xpZW50LnggLSBpbnRlcmFjdGlvbi5zdGFydENvb3Jkcy5jbGllbnQueDtcbiAgICAgICAgICAgICAgICB0aGlzLmR5ID0gY2xpZW50LnkgLSBpbnRlcmFjdGlvbi5zdGFydENvb3Jkcy5jbGllbnQueTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuZHggPSBwYWdlLnggLSBpbnRlcmFjdGlvbi5zdGFydENvb3Jkcy5wYWdlLng7XG4gICAgICAgICAgICAgICAgdGhpcy5keSA9IHBhZ2UueSAtIGludGVyYWN0aW9uLnN0YXJ0Q29vcmRzLnBhZ2UueTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChzdGFydGluZykge1xuICAgICAgICAgICAgdGhpcy5keCA9IDA7XG4gICAgICAgICAgICB0aGlzLmR5ID0gMDtcbiAgICAgICAgfVxuICAgICAgICAvLyBjb3B5IHByb3BlcnRpZXMgZnJvbSBwcmV2aW91c21vdmUgaWYgc3RhcnRpbmcgaW5lcnRpYVxuICAgICAgICBlbHNlIGlmIChwaGFzZSA9PT0gJ2luZXJ0aWFzdGFydCcpIHtcbiAgICAgICAgICAgIHRoaXMuZHggPSBpbnRlcmFjdGlvbi5wcmV2RXZlbnQuZHg7XG4gICAgICAgICAgICB0aGlzLmR5ID0gaW50ZXJhY3Rpb24ucHJldkV2ZW50LmR5O1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaWYgKGRlbHRhU291cmNlID09PSAnY2xpZW50Jykge1xuICAgICAgICAgICAgICAgIHRoaXMuZHggPSBjbGllbnQueCAtIGludGVyYWN0aW9uLnByZXZFdmVudC5jbGllbnRYO1xuICAgICAgICAgICAgICAgIHRoaXMuZHkgPSBjbGllbnQueSAtIGludGVyYWN0aW9uLnByZXZFdmVudC5jbGllbnRZO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5keCA9IHBhZ2UueCAtIGludGVyYWN0aW9uLnByZXZFdmVudC5wYWdlWDtcbiAgICAgICAgICAgICAgICB0aGlzLmR5ID0gcGFnZS55IC0gaW50ZXJhY3Rpb24ucHJldkV2ZW50LnBhZ2VZO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChpbnRlcmFjdGlvbi5wcmV2RXZlbnQgJiYgaW50ZXJhY3Rpb24ucHJldkV2ZW50LmRldGFpbCA9PT0gJ2luZXJ0aWEnXG4gICAgICAgICAgICAmJiAhaW5lcnRpYVN0YXR1cy5hY3RpdmVcbiAgICAgICAgICAgICYmIG9wdGlvbnNbYWN0aW9uXS5pbmVydGlhICYmIG9wdGlvbnNbYWN0aW9uXS5pbmVydGlhLnplcm9SZXN1bWVEZWx0YSkge1xuXG4gICAgICAgICAgICBpbmVydGlhU3RhdHVzLnJlc3VtZUR4ICs9IHRoaXMuZHg7XG4gICAgICAgICAgICBpbmVydGlhU3RhdHVzLnJlc3VtZUR5ICs9IHRoaXMuZHk7XG5cbiAgICAgICAgICAgIHRoaXMuZHggPSB0aGlzLmR5ID0gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChhY3Rpb24gPT09ICdyZXNpemUnICYmIGludGVyYWN0aW9uLnJlc2l6ZUF4ZXMpIHtcbiAgICAgICAgICAgIGlmIChvcHRpb25zLnJlc2l6ZS5zcXVhcmUpIHtcbiAgICAgICAgICAgICAgICBpZiAoaW50ZXJhY3Rpb24ucmVzaXplQXhlcyA9PT0gJ3knKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZHggPSB0aGlzLmR5O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5keSA9IHRoaXMuZHg7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMuYXhlcyA9ICd4eSc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLmF4ZXMgPSBpbnRlcmFjdGlvbi5yZXNpemVBeGVzO1xuXG4gICAgICAgICAgICAgICAgaWYgKGludGVyYWN0aW9uLnJlc2l6ZUF4ZXMgPT09ICd4Jykge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmR5ID0gMDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoaW50ZXJhY3Rpb24ucmVzaXplQXhlcyA9PT0gJ3knKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZHggPSAwO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChhY3Rpb24gPT09ICdnZXN0dXJlJykge1xuICAgICAgICAgICAgdGhpcy50b3VjaGVzID0gW3BvaW50ZXJzWzBdLCBwb2ludGVyc1sxXV07XG5cbiAgICAgICAgICAgIGlmIChzdGFydGluZykge1xuICAgICAgICAgICAgICAgIHRoaXMuZGlzdGFuY2UgPSB0b3VjaERpc3RhbmNlKHBvaW50ZXJzLCBkZWx0YVNvdXJjZSk7XG4gICAgICAgICAgICAgICAgdGhpcy5ib3ggICAgICA9IHRvdWNoQkJveChwb2ludGVycyk7XG4gICAgICAgICAgICAgICAgdGhpcy5zY2FsZSAgICA9IDE7XG4gICAgICAgICAgICAgICAgdGhpcy5kcyAgICAgICA9IDA7XG4gICAgICAgICAgICAgICAgdGhpcy5hbmdsZSAgICA9IHRvdWNoQW5nbGUocG9pbnRlcnMsIHVuZGVmaW5lZCwgZGVsdGFTb3VyY2UpO1xuICAgICAgICAgICAgICAgIHRoaXMuZGEgICAgICAgPSAwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoZW5kaW5nIHx8IGV2ZW50IGluc3RhbmNlb2YgSW50ZXJhY3RFdmVudCkge1xuICAgICAgICAgICAgICAgIHRoaXMuZGlzdGFuY2UgPSBpbnRlcmFjdGlvbi5wcmV2RXZlbnQuZGlzdGFuY2U7XG4gICAgICAgICAgICAgICAgdGhpcy5ib3ggICAgICA9IGludGVyYWN0aW9uLnByZXZFdmVudC5ib3g7XG4gICAgICAgICAgICAgICAgdGhpcy5zY2FsZSAgICA9IGludGVyYWN0aW9uLnByZXZFdmVudC5zY2FsZTtcbiAgICAgICAgICAgICAgICB0aGlzLmRzICAgICAgID0gdGhpcy5zY2FsZSAtIDE7XG4gICAgICAgICAgICAgICAgdGhpcy5hbmdsZSAgICA9IGludGVyYWN0aW9uLnByZXZFdmVudC5hbmdsZTtcbiAgICAgICAgICAgICAgICB0aGlzLmRhICAgICAgID0gdGhpcy5hbmdsZSAtIGludGVyYWN0aW9uLmdlc3R1cmUuc3RhcnRBbmdsZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuZGlzdGFuY2UgPSB0b3VjaERpc3RhbmNlKHBvaW50ZXJzLCBkZWx0YVNvdXJjZSk7XG4gICAgICAgICAgICAgICAgdGhpcy5ib3ggICAgICA9IHRvdWNoQkJveChwb2ludGVycyk7XG4gICAgICAgICAgICAgICAgdGhpcy5zY2FsZSAgICA9IHRoaXMuZGlzdGFuY2UgLyBpbnRlcmFjdGlvbi5nZXN0dXJlLnN0YXJ0RGlzdGFuY2U7XG4gICAgICAgICAgICAgICAgdGhpcy5hbmdsZSAgICA9IHRvdWNoQW5nbGUocG9pbnRlcnMsIGludGVyYWN0aW9uLmdlc3R1cmUucHJldkFuZ2xlLCBkZWx0YVNvdXJjZSk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLmRzID0gdGhpcy5zY2FsZSAtIGludGVyYWN0aW9uLmdlc3R1cmUucHJldlNjYWxlO1xuICAgICAgICAgICAgICAgIHRoaXMuZGEgPSB0aGlzLmFuZ2xlIC0gaW50ZXJhY3Rpb24uZ2VzdHVyZS5wcmV2QW5nbGU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhcnRpbmcpIHtcbiAgICAgICAgICAgIHRoaXMudGltZVN0YW1wID0gaW50ZXJhY3Rpb24uZG93blRpbWVzWzBdO1xuICAgICAgICAgICAgdGhpcy5kdCAgICAgICAgPSAwO1xuICAgICAgICAgICAgdGhpcy5kdXJhdGlvbiAgPSAwO1xuICAgICAgICAgICAgdGhpcy5zcGVlZCAgICAgPSAwO1xuICAgICAgICAgICAgdGhpcy52ZWxvY2l0eVggPSAwO1xuICAgICAgICAgICAgdGhpcy52ZWxvY2l0eVkgPSAwO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHBoYXNlID09PSAnaW5lcnRpYXN0YXJ0Jykge1xuICAgICAgICAgICAgdGhpcy50aW1lU3RhbXAgPSBpbnRlcmFjdGlvbi5wcmV2RXZlbnQudGltZVN0YW1wO1xuICAgICAgICAgICAgdGhpcy5kdCAgICAgICAgPSBpbnRlcmFjdGlvbi5wcmV2RXZlbnQuZHQ7XG4gICAgICAgICAgICB0aGlzLmR1cmF0aW9uICA9IGludGVyYWN0aW9uLnByZXZFdmVudC5kdXJhdGlvbjtcbiAgICAgICAgICAgIHRoaXMuc3BlZWQgICAgID0gaW50ZXJhY3Rpb24ucHJldkV2ZW50LnNwZWVkO1xuICAgICAgICAgICAgdGhpcy52ZWxvY2l0eVggPSBpbnRlcmFjdGlvbi5wcmV2RXZlbnQudmVsb2NpdHlYO1xuICAgICAgICAgICAgdGhpcy52ZWxvY2l0eVkgPSBpbnRlcmFjdGlvbi5wcmV2RXZlbnQudmVsb2NpdHlZO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy50aW1lU3RhbXAgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICAgICAgICAgIHRoaXMuZHQgICAgICAgID0gdGhpcy50aW1lU3RhbXAgLSBpbnRlcmFjdGlvbi5wcmV2RXZlbnQudGltZVN0YW1wO1xuICAgICAgICAgICAgdGhpcy5kdXJhdGlvbiAgPSB0aGlzLnRpbWVTdGFtcCAtIGludGVyYWN0aW9uLmRvd25UaW1lc1swXTtcblxuICAgICAgICAgICAgaWYgKGV2ZW50IGluc3RhbmNlb2YgSW50ZXJhY3RFdmVudCkge1xuICAgICAgICAgICAgICAgIHZhciBkeCA9IHRoaXNbc291cmNlWF0gLSBpbnRlcmFjdGlvbi5wcmV2RXZlbnRbc291cmNlWF0sXG4gICAgICAgICAgICAgICAgICAgIGR5ID0gdGhpc1tzb3VyY2VZXSAtIGludGVyYWN0aW9uLnByZXZFdmVudFtzb3VyY2VZXSxcbiAgICAgICAgICAgICAgICAgICAgZHQgPSB0aGlzLmR0IC8gMTAwMDtcblxuICAgICAgICAgICAgICAgIHRoaXMuc3BlZWQgPSBoeXBvdChkeCwgZHkpIC8gZHQ7XG4gICAgICAgICAgICAgICAgdGhpcy52ZWxvY2l0eVggPSBkeCAvIGR0O1xuICAgICAgICAgICAgICAgIHRoaXMudmVsb2NpdHlZID0gZHkgLyBkdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIGlmIG5vcm1hbCBtb3ZlIG9yIGVuZCBldmVudCwgdXNlIHByZXZpb3VzIHVzZXIgZXZlbnQgY29vcmRzXG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBzcGVlZCBhbmQgdmVsb2NpdHkgaW4gcGl4ZWxzIHBlciBzZWNvbmRcbiAgICAgICAgICAgICAgICB0aGlzLnNwZWVkID0gaW50ZXJhY3Rpb24ucG9pbnRlckRlbHRhW2RlbHRhU291cmNlXS5zcGVlZDtcbiAgICAgICAgICAgICAgICB0aGlzLnZlbG9jaXR5WCA9IGludGVyYWN0aW9uLnBvaW50ZXJEZWx0YVtkZWx0YVNvdXJjZV0udng7XG4gICAgICAgICAgICAgICAgdGhpcy52ZWxvY2l0eVkgPSBpbnRlcmFjdGlvbi5wb2ludGVyRGVsdGFbZGVsdGFTb3VyY2VdLnZ5O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKChlbmRpbmcgfHwgcGhhc2UgPT09ICdpbmVydGlhc3RhcnQnKVxuICAgICAgICAgICAgJiYgaW50ZXJhY3Rpb24ucHJldkV2ZW50LnNwZWVkID4gNjAwICYmIHRoaXMudGltZVN0YW1wIC0gaW50ZXJhY3Rpb24ucHJldkV2ZW50LnRpbWVTdGFtcCA8IDE1MCkge1xuXG4gICAgICAgICAgICB2YXIgYW5nbGUgPSAxODAgKiBNYXRoLmF0YW4yKGludGVyYWN0aW9uLnByZXZFdmVudC52ZWxvY2l0eVksIGludGVyYWN0aW9uLnByZXZFdmVudC52ZWxvY2l0eVgpIC8gTWF0aC5QSSxcbiAgICAgICAgICAgICAgICBvdmVybGFwID0gMjIuNTtcblxuICAgICAgICAgICAgaWYgKGFuZ2xlIDwgMCkge1xuICAgICAgICAgICAgICAgIGFuZ2xlICs9IDM2MDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGxlZnQgPSAxMzUgLSBvdmVybGFwIDw9IGFuZ2xlICYmIGFuZ2xlIDwgMjI1ICsgb3ZlcmxhcCxcbiAgICAgICAgICAgICAgICB1cCAgID0gMjI1IC0gb3ZlcmxhcCA8PSBhbmdsZSAmJiBhbmdsZSA8IDMxNSArIG92ZXJsYXAsXG5cbiAgICAgICAgICAgICAgICByaWdodCA9ICFsZWZ0ICYmICgzMTUgLSBvdmVybGFwIDw9IGFuZ2xlIHx8IGFuZ2xlIDwgIDQ1ICsgb3ZlcmxhcCksXG4gICAgICAgICAgICAgICAgZG93biAgPSAhdXAgICAmJiAgIDQ1IC0gb3ZlcmxhcCA8PSBhbmdsZSAmJiBhbmdsZSA8IDEzNSArIG92ZXJsYXA7XG5cbiAgICAgICAgICAgIHRoaXMuc3dpcGUgPSB7XG4gICAgICAgICAgICAgICAgdXAgICA6IHVwLFxuICAgICAgICAgICAgICAgIGRvd24gOiBkb3duLFxuICAgICAgICAgICAgICAgIGxlZnQgOiBsZWZ0LFxuICAgICAgICAgICAgICAgIHJpZ2h0OiByaWdodCxcbiAgICAgICAgICAgICAgICBhbmdsZTogYW5nbGUsXG4gICAgICAgICAgICAgICAgc3BlZWQ6IGludGVyYWN0aW9uLnByZXZFdmVudC5zcGVlZCxcbiAgICAgICAgICAgICAgICB2ZWxvY2l0eToge1xuICAgICAgICAgICAgICAgICAgICB4OiBpbnRlcmFjdGlvbi5wcmV2RXZlbnQudmVsb2NpdHlYLFxuICAgICAgICAgICAgICAgICAgICB5OiBpbnRlcmFjdGlvbi5wcmV2RXZlbnQudmVsb2NpdHlZXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIEludGVyYWN0RXZlbnQucHJvdG90eXBlID0ge1xuICAgICAgICBwcmV2ZW50RGVmYXVsdDogYmxhbmssXG4gICAgICAgIHN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5pbW1lZGlhdGVQcm9wYWdhdGlvblN0b3BwZWQgPSB0aGlzLnByb3BhZ2F0aW9uU3RvcHBlZCA9IHRydWU7XG4gICAgICAgIH0sXG4gICAgICAgIHN0b3BQcm9wYWdhdGlvbjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5wcm9wYWdhdGlvblN0b3BwZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIGZ1bmN0aW9uIHByZXZlbnRPcmlnaW5hbERlZmF1bHQgKCkge1xuICAgICAgICB0aGlzLm9yaWdpbmFsRXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRBY3Rpb25DdXJzb3IgKGFjdGlvbikge1xuICAgICAgICB2YXIgY3Vyc29yID0gJyc7XG5cbiAgICAgICAgaWYgKGFjdGlvbi5uYW1lID09PSAnZHJhZycpIHtcbiAgICAgICAgICAgIGN1cnNvciA9ICBhY3Rpb25DdXJzb3JzLmRyYWc7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGFjdGlvbi5uYW1lID09PSAncmVzaXplJykge1xuICAgICAgICAgICAgaWYgKGFjdGlvbi5heGlzKSB7XG4gICAgICAgICAgICAgICAgY3Vyc29yID0gIGFjdGlvbkN1cnNvcnNbYWN0aW9uLm5hbWUgKyBhY3Rpb24uYXhpc107XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChhY3Rpb24uZWRnZXMpIHtcbiAgICAgICAgICAgICAgICB2YXIgY3Vyc29yS2V5ID0gJ3Jlc2l6ZScsXG4gICAgICAgICAgICAgICAgICAgIGVkZ2VOYW1lcyA9IFsndG9wJywgJ2JvdHRvbScsICdsZWZ0JywgJ3JpZ2h0J107XG5cbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IDQ7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoYWN0aW9uLmVkZ2VzW2VkZ2VOYW1lc1tpXV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGN1cnNvcktleSArPSBlZGdlTmFtZXNbaV07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjdXJzb3IgPSBhY3Rpb25DdXJzb3JzW2N1cnNvcktleV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gY3Vyc29yO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNoZWNrUmVzaXplRWRnZSAobmFtZSwgdmFsdWUsIHBhZ2UsIGVsZW1lbnQsIGludGVyYWN0YWJsZUVsZW1lbnQsIHJlY3QsIG1hcmdpbikge1xuICAgICAgICAvLyBmYWxzZSwgJycsIHVuZGVmaW5lZCwgbnVsbFxuICAgICAgICBpZiAoIXZhbHVlKSB7IHJldHVybiBmYWxzZTsgfVxuXG4gICAgICAgIC8vIHRydWUgdmFsdWUsIHVzZSBwb2ludGVyIGNvb3JkcyBhbmQgZWxlbWVudCByZWN0XG4gICAgICAgIGlmICh2YWx1ZSA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgLy8gaWYgZGltZW5zaW9ucyBhcmUgbmVnYXRpdmUsIFwic3dpdGNoXCIgZWRnZXNcbiAgICAgICAgICAgIHZhciB3aWR0aCA9IGlzTnVtYmVyKHJlY3Qud2lkdGgpPyByZWN0LndpZHRoIDogcmVjdC5yaWdodCAtIHJlY3QubGVmdCxcbiAgICAgICAgICAgICAgICBoZWlnaHQgPSBpc051bWJlcihyZWN0LmhlaWdodCk/IHJlY3QuaGVpZ2h0IDogcmVjdC5ib3R0b20gLSByZWN0LnRvcDtcblxuICAgICAgICAgICAgaWYgKHdpZHRoIDwgMCkge1xuICAgICAgICAgICAgICAgIGlmICAgICAgKG5hbWUgPT09ICdsZWZ0JyApIHsgbmFtZSA9ICdyaWdodCc7IH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChuYW1lID09PSAncmlnaHQnKSB7IG5hbWUgPSAnbGVmdCcgOyB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaGVpZ2h0IDwgMCkge1xuICAgICAgICAgICAgICAgIGlmICAgICAgKG5hbWUgPT09ICd0b3AnICAgKSB7IG5hbWUgPSAnYm90dG9tJzsgfVxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKG5hbWUgPT09ICdib3R0b20nKSB7IG5hbWUgPSAndG9wJyAgIDsgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAobmFtZSA9PT0gJ2xlZnQnICApIHsgcmV0dXJuIHBhZ2UueCA8ICgod2lkdGggID49IDA/IHJlY3QubGVmdDogcmVjdC5yaWdodCApICsgbWFyZ2luKTsgfVxuICAgICAgICAgICAgaWYgKG5hbWUgPT09ICd0b3AnICAgKSB7IHJldHVybiBwYWdlLnkgPCAoKGhlaWdodCA+PSAwPyByZWN0LnRvcCA6IHJlY3QuYm90dG9tKSArIG1hcmdpbik7IH1cblxuICAgICAgICAgICAgaWYgKG5hbWUgPT09ICdyaWdodCcgKSB7IHJldHVybiBwYWdlLnggPiAoKHdpZHRoICA+PSAwPyByZWN0LnJpZ2h0IDogcmVjdC5sZWZ0KSAtIG1hcmdpbik7IH1cbiAgICAgICAgICAgIGlmIChuYW1lID09PSAnYm90dG9tJykgeyByZXR1cm4gcGFnZS55ID4gKChoZWlnaHQgPj0gMD8gcmVjdC5ib3R0b206IHJlY3QudG9wICkgLSBtYXJnaW4pOyB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyB0aGUgcmVtYWluaW5nIGNoZWNrcyByZXF1aXJlIGFuIGVsZW1lbnRcbiAgICAgICAgaWYgKCFpc0VsZW1lbnQoZWxlbWVudCkpIHsgcmV0dXJuIGZhbHNlOyB9XG5cbiAgICAgICAgcmV0dXJuIGlzRWxlbWVudCh2YWx1ZSlcbiAgICAgICAgICAgICAgICAgICAgLy8gdGhlIHZhbHVlIGlzIGFuIGVsZW1lbnQgdG8gdXNlIGFzIGEgcmVzaXplIGhhbmRsZVxuICAgICAgICAgICAgICAgICAgICA/IHZhbHVlID09PSBlbGVtZW50XG4gICAgICAgICAgICAgICAgICAgIC8vIG90aGVyd2lzZSBjaGVjayBpZiBlbGVtZW50IG1hdGNoZXMgdmFsdWUgYXMgc2VsZWN0b3JcbiAgICAgICAgICAgICAgICAgICAgOiBtYXRjaGVzVXBUbyhlbGVtZW50LCB2YWx1ZSwgaW50ZXJhY3RhYmxlRWxlbWVudCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZGVmYXVsdEFjdGlvbkNoZWNrZXIgKHBvaW50ZXIsIGludGVyYWN0aW9uLCBlbGVtZW50KSB7XG4gICAgICAgIHZhciByZWN0ID0gdGhpcy5nZXRSZWN0KGVsZW1lbnQpLFxuICAgICAgICAgICAgc2hvdWxkUmVzaXplID0gZmFsc2UsXG4gICAgICAgICAgICBhY3Rpb24gPSBudWxsLFxuICAgICAgICAgICAgcmVzaXplQXhlcyA9IG51bGwsXG4gICAgICAgICAgICByZXNpemVFZGdlcyxcbiAgICAgICAgICAgIHBhZ2UgPSBleHRlbmQoe30sIGludGVyYWN0aW9uLmN1ckNvb3Jkcy5wYWdlKSxcbiAgICAgICAgICAgIG9wdGlvbnMgPSB0aGlzLm9wdGlvbnM7XG5cbiAgICAgICAgaWYgKCFyZWN0KSB7IHJldHVybiBudWxsOyB9XG5cbiAgICAgICAgaWYgKGFjdGlvbklzRW5hYmxlZC5yZXNpemUgJiYgb3B0aW9ucy5yZXNpemUuZW5hYmxlZCkge1xuICAgICAgICAgICAgdmFyIHJlc2l6ZU9wdGlvbnMgPSBvcHRpb25zLnJlc2l6ZTtcblxuICAgICAgICAgICAgcmVzaXplRWRnZXMgPSB7XG4gICAgICAgICAgICAgICAgbGVmdDogZmFsc2UsIHJpZ2h0OiBmYWxzZSwgdG9wOiBmYWxzZSwgYm90dG9tOiBmYWxzZVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgLy8gaWYgdXNpbmcgcmVzaXplLmVkZ2VzXG4gICAgICAgICAgICBpZiAoaXNPYmplY3QocmVzaXplT3B0aW9ucy5lZGdlcykpIHtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBlZGdlIGluIHJlc2l6ZUVkZ2VzKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc2l6ZUVkZ2VzW2VkZ2VdID0gY2hlY2tSZXNpemVFZGdlKGVkZ2UsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc2l6ZU9wdGlvbnMuZWRnZXNbZWRnZV0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhZ2UsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGludGVyYWN0aW9uLl9ldmVudFRhcmdldCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVjdCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzaXplT3B0aW9ucy5tYXJnaW4gfHwgbWFyZ2luKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXNpemVFZGdlcy5sZWZ0ID0gcmVzaXplRWRnZXMubGVmdCAmJiAhcmVzaXplRWRnZXMucmlnaHQ7XG4gICAgICAgICAgICAgICAgcmVzaXplRWRnZXMudG9wICA9IHJlc2l6ZUVkZ2VzLnRvcCAgJiYgIXJlc2l6ZUVkZ2VzLmJvdHRvbTtcblxuICAgICAgICAgICAgICAgIHNob3VsZFJlc2l6ZSA9IHJlc2l6ZUVkZ2VzLmxlZnQgfHwgcmVzaXplRWRnZXMucmlnaHQgfHwgcmVzaXplRWRnZXMudG9wIHx8IHJlc2l6ZUVkZ2VzLmJvdHRvbTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciByaWdodCAgPSBvcHRpb25zLnJlc2l6ZS5heGlzICE9PSAneScgJiYgcGFnZS54ID4gKHJlY3QucmlnaHQgIC0gbWFyZ2luKSxcbiAgICAgICAgICAgICAgICAgICAgYm90dG9tID0gb3B0aW9ucy5yZXNpemUuYXhpcyAhPT0gJ3gnICYmIHBhZ2UueSA+IChyZWN0LmJvdHRvbSAtIG1hcmdpbik7XG5cbiAgICAgICAgICAgICAgICBzaG91bGRSZXNpemUgPSByaWdodCB8fCBib3R0b207XG4gICAgICAgICAgICAgICAgcmVzaXplQXhlcyA9IChyaWdodD8gJ3gnIDogJycpICsgKGJvdHRvbT8gJ3knIDogJycpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgYWN0aW9uID0gc2hvdWxkUmVzaXplXG4gICAgICAgICAgICA/ICdyZXNpemUnXG4gICAgICAgICAgICA6IGFjdGlvbklzRW5hYmxlZC5kcmFnICYmIG9wdGlvbnMuZHJhZy5lbmFibGVkXG4gICAgICAgICAgICAgICAgPyAnZHJhZydcbiAgICAgICAgICAgICAgICA6IG51bGw7XG5cbiAgICAgICAgaWYgKGFjdGlvbklzRW5hYmxlZC5nZXN0dXJlXG4gICAgICAgICAgICAmJiBpbnRlcmFjdGlvbi5wb2ludGVySWRzLmxlbmd0aCA+PTJcbiAgICAgICAgICAgICYmICEoaW50ZXJhY3Rpb24uZHJhZ2dpbmcgfHwgaW50ZXJhY3Rpb24ucmVzaXppbmcpKSB7XG4gICAgICAgICAgICBhY3Rpb24gPSAnZ2VzdHVyZSc7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoYWN0aW9uKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIG5hbWU6IGFjdGlvbixcbiAgICAgICAgICAgICAgICBheGlzOiByZXNpemVBeGVzLFxuICAgICAgICAgICAgICAgIGVkZ2VzOiByZXNpemVFZGdlc1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIC8vIENoZWNrIGlmIGFjdGlvbiBpcyBlbmFibGVkIGdsb2JhbGx5IGFuZCB0aGUgY3VycmVudCB0YXJnZXQgc3VwcG9ydHMgaXRcbiAgICAvLyBJZiBzbywgcmV0dXJuIHRoZSB2YWxpZGF0ZWQgYWN0aW9uLiBPdGhlcndpc2UsIHJldHVybiBudWxsXG4gICAgZnVuY3Rpb24gdmFsaWRhdGVBY3Rpb24gKGFjdGlvbiwgaW50ZXJhY3RhYmxlKSB7XG4gICAgICAgIGlmICghaXNPYmplY3QoYWN0aW9uKSkgeyByZXR1cm4gbnVsbDsgfVxuXG4gICAgICAgIHZhciBhY3Rpb25OYW1lID0gYWN0aW9uLm5hbWUsXG4gICAgICAgICAgICBvcHRpb25zID0gaW50ZXJhY3RhYmxlLm9wdGlvbnM7XG5cbiAgICAgICAgaWYgKCggIChhY3Rpb25OYW1lICA9PT0gJ3Jlc2l6ZScgICAmJiBvcHRpb25zLnJlc2l6ZS5lbmFibGVkIClcbiAgICAgICAgICAgIHx8IChhY3Rpb25OYW1lICAgICAgPT09ICdkcmFnJyAgICAgJiYgb3B0aW9ucy5kcmFnLmVuYWJsZWQgIClcbiAgICAgICAgICAgIHx8IChhY3Rpb25OYW1lICAgICAgPT09ICdnZXN0dXJlJyAgJiYgb3B0aW9ucy5nZXN0dXJlLmVuYWJsZWQpKVxuICAgICAgICAgICAgJiYgYWN0aW9uSXNFbmFibGVkW2FjdGlvbk5hbWVdKSB7XG5cbiAgICAgICAgICAgIGlmIChhY3Rpb25OYW1lID09PSAncmVzaXplJyB8fCBhY3Rpb25OYW1lID09PSAncmVzaXpleXgnKSB7XG4gICAgICAgICAgICAgICAgYWN0aW9uTmFtZSA9ICdyZXNpemV4eSc7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBhY3Rpb247XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgdmFyIGxpc3RlbmVycyA9IHt9LFxuICAgICAgICBpbnRlcmFjdGlvbkxpc3RlbmVycyA9IFtcbiAgICAgICAgICAgICdkcmFnU3RhcnQnLCAnZHJhZ01vdmUnLCAncmVzaXplU3RhcnQnLCAncmVzaXplTW92ZScsICdnZXN0dXJlU3RhcnQnLCAnZ2VzdHVyZU1vdmUnLFxuICAgICAgICAgICAgJ3BvaW50ZXJPdmVyJywgJ3BvaW50ZXJPdXQnLCAncG9pbnRlckhvdmVyJywgJ3NlbGVjdG9yRG93bicsXG4gICAgICAgICAgICAncG9pbnRlckRvd24nLCAncG9pbnRlck1vdmUnLCAncG9pbnRlclVwJywgJ3BvaW50ZXJDYW5jZWwnLCAncG9pbnRlckVuZCcsXG4gICAgICAgICAgICAnYWRkUG9pbnRlcicsICdyZW1vdmVQb2ludGVyJywgJ3JlY29yZFBvaW50ZXInLCAnYXV0b1Njcm9sbE1vdmUnXG4gICAgICAgIF07XG5cbiAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gaW50ZXJhY3Rpb25MaXN0ZW5lcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgdmFyIG5hbWUgPSBpbnRlcmFjdGlvbkxpc3RlbmVyc1tpXTtcblxuICAgICAgICBsaXN0ZW5lcnNbbmFtZV0gPSBkb09uSW50ZXJhY3Rpb25zKG5hbWUpO1xuICAgIH1cblxuICAgIC8vIGJvdW5kIHRvIHRoZSBpbnRlcmFjdGFibGUgY29udGV4dCB3aGVuIGEgRE9NIGV2ZW50XG4gICAgLy8gbGlzdGVuZXIgaXMgYWRkZWQgdG8gYSBzZWxlY3RvciBpbnRlcmFjdGFibGVcbiAgICBmdW5jdGlvbiBkZWxlZ2F0ZUxpc3RlbmVyIChldmVudCwgdXNlQ2FwdHVyZSkge1xuICAgICAgICB2YXIgZmFrZUV2ZW50ID0ge30sXG4gICAgICAgICAgICBkZWxlZ2F0ZWQgPSBkZWxlZ2F0ZWRFdmVudHNbZXZlbnQudHlwZV0sXG4gICAgICAgICAgICBldmVudFRhcmdldCA9IGdldEFjdHVhbEVsZW1lbnQoZXZlbnQucGF0aFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgID8gZXZlbnQucGF0aFswXVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDogZXZlbnQudGFyZ2V0KSxcbiAgICAgICAgICAgIGVsZW1lbnQgPSBldmVudFRhcmdldDtcblxuICAgICAgICB1c2VDYXB0dXJlID0gdXNlQ2FwdHVyZT8gdHJ1ZTogZmFsc2U7XG5cbiAgICAgICAgLy8gZHVwbGljYXRlIHRoZSBldmVudCBzbyB0aGF0IGN1cnJlbnRUYXJnZXQgY2FuIGJlIGNoYW5nZWRcbiAgICAgICAgZm9yICh2YXIgcHJvcCBpbiBldmVudCkge1xuICAgICAgICAgICAgZmFrZUV2ZW50W3Byb3BdID0gZXZlbnRbcHJvcF07XG4gICAgICAgIH1cblxuICAgICAgICBmYWtlRXZlbnQub3JpZ2luYWxFdmVudCA9IGV2ZW50O1xuICAgICAgICBmYWtlRXZlbnQucHJldmVudERlZmF1bHQgPSBwcmV2ZW50T3JpZ2luYWxEZWZhdWx0O1xuXG4gICAgICAgIC8vIGNsaW1iIHVwIGRvY3VtZW50IHRyZWUgbG9va2luZyBmb3Igc2VsZWN0b3IgbWF0Y2hlc1xuICAgICAgICB3aGlsZSAoaXNFbGVtZW50KGVsZW1lbnQpKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGRlbGVnYXRlZC5zZWxlY3RvcnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgc2VsZWN0b3IgPSBkZWxlZ2F0ZWQuc2VsZWN0b3JzW2ldLFxuICAgICAgICAgICAgICAgICAgICBjb250ZXh0ID0gZGVsZWdhdGVkLmNvbnRleHRzW2ldO1xuXG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoZXNTZWxlY3RvcihlbGVtZW50LCBzZWxlY3RvcilcbiAgICAgICAgICAgICAgICAgICAgJiYgbm9kZUNvbnRhaW5zKGNvbnRleHQsIGV2ZW50VGFyZ2V0KVxuICAgICAgICAgICAgICAgICAgICAmJiBub2RlQ29udGFpbnMoY29udGV4dCwgZWxlbWVudCkpIHtcblxuICAgICAgICAgICAgICAgICAgICB2YXIgbGlzdGVuZXJzID0gZGVsZWdhdGVkLmxpc3RlbmVyc1tpXTtcblxuICAgICAgICAgICAgICAgICAgICBmYWtlRXZlbnQuY3VycmVudFRhcmdldCA9IGVsZW1lbnQ7XG5cbiAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBsaXN0ZW5lcnMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChsaXN0ZW5lcnNbal1bMV0gPT09IHVzZUNhcHR1cmUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lcnNbal1bMF0oZmFrZUV2ZW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZWxlbWVudCA9IHBhcmVudEVsZW1lbnQoZWxlbWVudCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBkZWxlZ2F0ZVVzZUNhcHR1cmUgKGV2ZW50KSB7XG4gICAgICAgIHJldHVybiBkZWxlZ2F0ZUxpc3RlbmVyLmNhbGwodGhpcywgZXZlbnQsIHRydWUpO1xuICAgIH1cblxuICAgIGludGVyYWN0YWJsZXMuaW5kZXhPZkVsZW1lbnQgPSBmdW5jdGlvbiBpbmRleE9mRWxlbWVudCAoZWxlbWVudCwgY29udGV4dCkge1xuICAgICAgICBjb250ZXh0ID0gY29udGV4dCB8fCBkb2N1bWVudDtcblxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBpbnRlcmFjdGFibGUgPSB0aGlzW2ldO1xuXG4gICAgICAgICAgICBpZiAoKGludGVyYWN0YWJsZS5zZWxlY3RvciA9PT0gZWxlbWVudFxuICAgICAgICAgICAgICAgICYmIChpbnRlcmFjdGFibGUuX2NvbnRleHQgPT09IGNvbnRleHQpKVxuICAgICAgICAgICAgICAgIHx8ICghaW50ZXJhY3RhYmxlLnNlbGVjdG9yICYmIGludGVyYWN0YWJsZS5fZWxlbWVudCA9PT0gZWxlbWVudCkpIHtcblxuICAgICAgICAgICAgICAgIHJldHVybiBpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiAtMTtcbiAgICB9O1xuXG4gICAgaW50ZXJhY3RhYmxlcy5nZXQgPSBmdW5jdGlvbiBpbnRlcmFjdGFibGVHZXQgKGVsZW1lbnQsIG9wdGlvbnMpIHtcbiAgICAgICAgcmV0dXJuIHRoaXNbdGhpcy5pbmRleE9mRWxlbWVudChlbGVtZW50LCBvcHRpb25zICYmIG9wdGlvbnMuY29udGV4dCldO1xuICAgIH07XG5cbiAgICBpbnRlcmFjdGFibGVzLmZvckVhY2hTZWxlY3RvciA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBpbnRlcmFjdGFibGUgPSB0aGlzW2ldO1xuXG4gICAgICAgICAgICBpZiAoIWludGVyYWN0YWJsZS5zZWxlY3Rvcikge1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgcmV0ID0gY2FsbGJhY2soaW50ZXJhY3RhYmxlLCBpbnRlcmFjdGFibGUuc2VsZWN0b3IsIGludGVyYWN0YWJsZS5fY29udGV4dCwgaSwgdGhpcyk7XG5cbiAgICAgICAgICAgIGlmIChyZXQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiByZXQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgLypcXFxuICAgICAqIGludGVyYWN0XG4gICAgIFsgbWV0aG9kIF1cbiAgICAgKlxuICAgICAqIFRoZSBtZXRob2RzIG9mIHRoaXMgdmFyaWFibGUgY2FuIGJlIHVzZWQgdG8gc2V0IGVsZW1lbnRzIGFzXG4gICAgICogaW50ZXJhY3RhYmxlcyBhbmQgYWxzbyB0byBjaGFuZ2UgdmFyaW91cyBkZWZhdWx0IHNldHRpbmdzLlxuICAgICAqXG4gICAgICogQ2FsbGluZyBpdCBhcyBhIGZ1bmN0aW9uIGFuZCBwYXNzaW5nIGFuIGVsZW1lbnQgb3IgYSB2YWxpZCBDU1Mgc2VsZWN0b3JcbiAgICAgKiBzdHJpbmcgcmV0dXJucyBhbiBJbnRlcmFjdGFibGUgb2JqZWN0IHdoaWNoIGhhcyB2YXJpb3VzIG1ldGhvZHMgdG9cbiAgICAgKiBjb25maWd1cmUgaXQuXG4gICAgICpcbiAgICAgLSBlbGVtZW50IChFbGVtZW50IHwgc3RyaW5nKSBUaGUgSFRNTCBvciBTVkcgRWxlbWVudCB0byBpbnRlcmFjdCB3aXRoIG9yIENTUyBzZWxlY3RvclxuICAgICA9IChvYmplY3QpIEFuIEBJbnRlcmFjdGFibGVcbiAgICAgKlxuICAgICA+IFVzYWdlXG4gICAgIHwgaW50ZXJhY3QoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2RyYWdnYWJsZScpKS5kcmFnZ2FibGUodHJ1ZSk7XG4gICAgIHxcbiAgICAgfCB2YXIgcmVjdGFibGVzID0gaW50ZXJhY3QoJ3JlY3QnKTtcbiAgICAgfCByZWN0YWJsZXNcbiAgICAgfCAgICAgLmdlc3R1cmFibGUodHJ1ZSlcbiAgICAgfCAgICAgLm9uKCdnZXN0dXJlbW92ZScsIGZ1bmN0aW9uIChldmVudCkge1xuICAgICB8ICAgICAgICAgLy8gc29tZXRoaW5nIGNvb2wuLi5cbiAgICAgfCAgICAgfSlcbiAgICAgfCAgICAgLmF1dG9TY3JvbGwodHJ1ZSk7XG4gICAgXFwqL1xuICAgIGZ1bmN0aW9uIGludGVyYWN0IChlbGVtZW50LCBvcHRpb25zKSB7XG4gICAgICAgIHJldHVybiBpbnRlcmFjdGFibGVzLmdldChlbGVtZW50LCBvcHRpb25zKSB8fCBuZXcgSW50ZXJhY3RhYmxlKGVsZW1lbnQsIG9wdGlvbnMpO1xuICAgIH1cblxuICAgIC8qXFxcbiAgICAgKiBJbnRlcmFjdGFibGVcbiAgICAgWyBwcm9wZXJ0eSBdXG4gICAgICoqXG4gICAgICogT2JqZWN0IHR5cGUgcmV0dXJuZWQgYnkgQGludGVyYWN0XG4gICAgXFwqL1xuICAgIGZ1bmN0aW9uIEludGVyYWN0YWJsZSAoZWxlbWVudCwgb3B0aW9ucykge1xuICAgICAgICB0aGlzLl9lbGVtZW50ID0gZWxlbWVudDtcbiAgICAgICAgdGhpcy5faUV2ZW50cyA9IHRoaXMuX2lFdmVudHMgfHwge307XG5cbiAgICAgICAgdmFyIF93aW5kb3c7XG5cbiAgICAgICAgaWYgKHRyeVNlbGVjdG9yKGVsZW1lbnQpKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdG9yID0gZWxlbWVudDtcblxuICAgICAgICAgICAgdmFyIGNvbnRleHQgPSBvcHRpb25zICYmIG9wdGlvbnMuY29udGV4dDtcblxuICAgICAgICAgICAgX3dpbmRvdyA9IGNvbnRleHQ/IGdldFdpbmRvdyhjb250ZXh0KSA6IHdpbmRvdztcblxuICAgICAgICAgICAgaWYgKGNvbnRleHQgJiYgKF93aW5kb3cuTm9kZVxuICAgICAgICAgICAgICAgICAgICA/IGNvbnRleHQgaW5zdGFuY2VvZiBfd2luZG93Lk5vZGVcbiAgICAgICAgICAgICAgICAgICAgOiAoaXNFbGVtZW50KGNvbnRleHQpIHx8IGNvbnRleHQgPT09IF93aW5kb3cuZG9jdW1lbnQpKSkge1xuXG4gICAgICAgICAgICAgICAgdGhpcy5fY29udGV4dCA9IGNvbnRleHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBfd2luZG93ID0gZ2V0V2luZG93KGVsZW1lbnQpO1xuXG4gICAgICAgICAgICBpZiAoaXNFbGVtZW50KGVsZW1lbnQsIF93aW5kb3cpKSB7XG5cbiAgICAgICAgICAgICAgICBpZiAoUG9pbnRlckV2ZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIGV2ZW50cy5hZGQodGhpcy5fZWxlbWVudCwgcEV2ZW50VHlwZXMuZG93biwgbGlzdGVuZXJzLnBvaW50ZXJEb3duICk7XG4gICAgICAgICAgICAgICAgICAgIGV2ZW50cy5hZGQodGhpcy5fZWxlbWVudCwgcEV2ZW50VHlwZXMubW92ZSwgbGlzdGVuZXJzLnBvaW50ZXJIb3Zlcik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBldmVudHMuYWRkKHRoaXMuX2VsZW1lbnQsICdtb3VzZWRvd24nICwgbGlzdGVuZXJzLnBvaW50ZXJEb3duICk7XG4gICAgICAgICAgICAgICAgICAgIGV2ZW50cy5hZGQodGhpcy5fZWxlbWVudCwgJ21vdXNlbW92ZScgLCBsaXN0ZW5lcnMucG9pbnRlckhvdmVyKTtcbiAgICAgICAgICAgICAgICAgICAgZXZlbnRzLmFkZCh0aGlzLl9lbGVtZW50LCAndG91Y2hzdGFydCcsIGxpc3RlbmVycy5wb2ludGVyRG93biApO1xuICAgICAgICAgICAgICAgICAgICBldmVudHMuYWRkKHRoaXMuX2VsZW1lbnQsICd0b3VjaG1vdmUnICwgbGlzdGVuZXJzLnBvaW50ZXJIb3Zlcik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fZG9jID0gX3dpbmRvdy5kb2N1bWVudDtcblxuICAgICAgICBpZiAoIWNvbnRhaW5zKGRvY3VtZW50cywgdGhpcy5fZG9jKSkge1xuICAgICAgICAgICAgbGlzdGVuVG9Eb2N1bWVudCh0aGlzLl9kb2MpO1xuICAgICAgICB9XG5cbiAgICAgICAgaW50ZXJhY3RhYmxlcy5wdXNoKHRoaXMpO1xuXG4gICAgICAgIHRoaXMuc2V0KG9wdGlvbnMpO1xuICAgIH1cblxuICAgIEludGVyYWN0YWJsZS5wcm90b3R5cGUgPSB7XG4gICAgICAgIHNldE9uRXZlbnRzOiBmdW5jdGlvbiAoYWN0aW9uLCBwaGFzZXMpIHtcbiAgICAgICAgICAgIGlmIChhY3Rpb24gPT09ICdkcm9wJykge1xuICAgICAgICAgICAgICAgIGlmIChpc0Z1bmN0aW9uKHBoYXNlcy5vbmRyb3ApICAgICAgICAgICkgeyB0aGlzLm9uZHJvcCAgICAgICAgICAgPSBwaGFzZXMub25kcm9wICAgICAgICAgIDsgfVxuICAgICAgICAgICAgICAgIGlmIChpc0Z1bmN0aW9uKHBoYXNlcy5vbmRyb3BhY3RpdmF0ZSkgICkgeyB0aGlzLm9uZHJvcGFjdGl2YXRlICAgPSBwaGFzZXMub25kcm9wYWN0aXZhdGUgIDsgfVxuICAgICAgICAgICAgICAgIGlmIChpc0Z1bmN0aW9uKHBoYXNlcy5vbmRyb3BkZWFjdGl2YXRlKSkgeyB0aGlzLm9uZHJvcGRlYWN0aXZhdGUgPSBwaGFzZXMub25kcm9wZGVhY3RpdmF0ZTsgfVxuICAgICAgICAgICAgICAgIGlmIChpc0Z1bmN0aW9uKHBoYXNlcy5vbmRyYWdlbnRlcikgICAgICkgeyB0aGlzLm9uZHJhZ2VudGVyICAgICAgPSBwaGFzZXMub25kcmFnZW50ZXIgICAgIDsgfVxuICAgICAgICAgICAgICAgIGlmIChpc0Z1bmN0aW9uKHBoYXNlcy5vbmRyYWdsZWF2ZSkgICAgICkgeyB0aGlzLm9uZHJhZ2xlYXZlICAgICAgPSBwaGFzZXMub25kcmFnbGVhdmUgICAgIDsgfVxuICAgICAgICAgICAgICAgIGlmIChpc0Z1bmN0aW9uKHBoYXNlcy5vbmRyb3Btb3ZlKSAgICAgICkgeyB0aGlzLm9uZHJvcG1vdmUgICAgICAgPSBwaGFzZXMub25kcm9wbW92ZSAgICAgIDsgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgYWN0aW9uID0gJ29uJyArIGFjdGlvbjtcblxuICAgICAgICAgICAgICAgIGlmIChpc0Z1bmN0aW9uKHBoYXNlcy5vbnN0YXJ0KSAgICAgICApIHsgdGhpc1thY3Rpb24gKyAnc3RhcnQnICAgICAgICAgXSA9IHBoYXNlcy5vbnN0YXJ0ICAgICAgICAgOyB9XG4gICAgICAgICAgICAgICAgaWYgKGlzRnVuY3Rpb24ocGhhc2VzLm9ubW92ZSkgICAgICAgICkgeyB0aGlzW2FjdGlvbiArICdtb3ZlJyAgICAgICAgICBdID0gcGhhc2VzLm9ubW92ZSAgICAgICAgICA7IH1cbiAgICAgICAgICAgICAgICBpZiAoaXNGdW5jdGlvbihwaGFzZXMub25lbmQpICAgICAgICAgKSB7IHRoaXNbYWN0aW9uICsgJ2VuZCcgICAgICAgICAgIF0gPSBwaGFzZXMub25lbmQgICAgICAgICAgIDsgfVxuICAgICAgICAgICAgICAgIGlmIChpc0Z1bmN0aW9uKHBoYXNlcy5vbmluZXJ0aWFzdGFydCkpIHsgdGhpc1thY3Rpb24gKyAnaW5lcnRpYXN0YXJ0JyAgXSA9IHBoYXNlcy5vbmluZXJ0aWFzdGFydCAgOyB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qXFxcbiAgICAgICAgICogSW50ZXJhY3RhYmxlLmRyYWdnYWJsZVxuICAgICAgICAgWyBtZXRob2QgXVxuICAgICAgICAgKlxuICAgICAgICAgKiBHZXRzIG9yIHNldHMgd2hldGhlciBkcmFnIGFjdGlvbnMgY2FuIGJlIHBlcmZvcm1lZCBvbiB0aGVcbiAgICAgICAgICogSW50ZXJhY3RhYmxlXG4gICAgICAgICAqXG4gICAgICAgICA9IChib29sZWFuKSBJbmRpY2F0ZXMgaWYgdGhpcyBjYW4gYmUgdGhlIHRhcmdldCBvZiBkcmFnIGV2ZW50c1xuICAgICAgICAgfCB2YXIgaXNEcmFnZ2FibGUgPSBpbnRlcmFjdCgndWwgbGknKS5kcmFnZ2FibGUoKTtcbiAgICAgICAgICogb3JcbiAgICAgICAgIC0gb3B0aW9ucyAoYm9vbGVhbiB8IG9iamVjdCkgI29wdGlvbmFsIHRydWUvZmFsc2Ugb3IgQW4gb2JqZWN0IHdpdGggZXZlbnQgbGlzdGVuZXJzIHRvIGJlIGZpcmVkIG9uIGRyYWcgZXZlbnRzIChvYmplY3QgbWFrZXMgdGhlIEludGVyYWN0YWJsZSBkcmFnZ2FibGUpXG4gICAgICAgICA9IChvYmplY3QpIFRoaXMgSW50ZXJhY3RhYmxlXG4gICAgICAgICB8IGludGVyYWN0KGVsZW1lbnQpLmRyYWdnYWJsZSh7XG4gICAgICAgICB8ICAgICBvbnN0YXJ0OiBmdW5jdGlvbiAoZXZlbnQpIHt9LFxuICAgICAgICAgfCAgICAgb25tb3ZlIDogZnVuY3Rpb24gKGV2ZW50KSB7fSxcbiAgICAgICAgIHwgICAgIG9uZW5kICA6IGZ1bmN0aW9uIChldmVudCkge30sXG4gICAgICAgICB8XG4gICAgICAgICB8ICAgICAvLyB0aGUgYXhpcyBpbiB3aGljaCB0aGUgZmlyc3QgbW92ZW1lbnQgbXVzdCBiZVxuICAgICAgICAgfCAgICAgLy8gZm9yIHRoZSBkcmFnIHNlcXVlbmNlIHRvIHN0YXJ0XG4gICAgICAgICB8ICAgICAvLyAneHknIGJ5IGRlZmF1bHQgLSBhbnkgZGlyZWN0aW9uXG4gICAgICAgICB8ICAgICBheGlzOiAneCcgfHwgJ3knIHx8ICd4eScsXG4gICAgICAgICB8XG4gICAgICAgICB8ICAgICAvLyBtYXggbnVtYmVyIG9mIGRyYWdzIHRoYXQgY2FuIGhhcHBlbiBjb25jdXJyZW50bHlcbiAgICAgICAgIHwgICAgIC8vIHdpdGggZWxlbWVudHMgb2YgdGhpcyBJbnRlcmFjdGFibGUuIEluZmluaXR5IGJ5IGRlZmF1bHRcbiAgICAgICAgIHwgICAgIG1heDogSW5maW5pdHksXG4gICAgICAgICB8XG4gICAgICAgICB8ICAgICAvLyBtYXggbnVtYmVyIG9mIGRyYWdzIHRoYXQgY2FuIHRhcmdldCB0aGUgc2FtZSBlbGVtZW50K0ludGVyYWN0YWJsZVxuICAgICAgICAgfCAgICAgLy8gMSBieSBkZWZhdWx0XG4gICAgICAgICB8ICAgICBtYXhQZXJFbGVtZW50OiAyXG4gICAgICAgICB8IH0pO1xuICAgICAgICBcXCovXG4gICAgICAgIGRyYWdnYWJsZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGlmIChpc09iamVjdChvcHRpb25zKSkge1xuICAgICAgICAgICAgICAgIHRoaXMub3B0aW9ucy5kcmFnLmVuYWJsZWQgPSBvcHRpb25zLmVuYWJsZWQgPT09IGZhbHNlPyBmYWxzZTogdHJ1ZTtcbiAgICAgICAgICAgICAgICB0aGlzLnNldFBlckFjdGlvbignZHJhZycsIG9wdGlvbnMpO1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0T25FdmVudHMoJ2RyYWcnLCBvcHRpb25zKTtcblxuICAgICAgICAgICAgICAgIGlmICgvXngkfF55JHxeeHkkLy50ZXN0KG9wdGlvbnMuYXhpcykpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLmRyYWcuYXhpcyA9IG9wdGlvbnMuYXhpcztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAob3B0aW9ucy5heGlzID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlbGV0ZSB0aGlzLm9wdGlvbnMuZHJhZy5heGlzO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoaXNCb29sKG9wdGlvbnMpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLmRyYWcuZW5hYmxlZCA9IG9wdGlvbnM7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRoaXMub3B0aW9ucy5kcmFnO1xuICAgICAgICB9LFxuXG4gICAgICAgIHNldFBlckFjdGlvbjogZnVuY3Rpb24gKGFjdGlvbiwgb3B0aW9ucykge1xuICAgICAgICAgICAgLy8gZm9yIGFsbCB0aGUgZGVmYXVsdCBwZXItYWN0aW9uIG9wdGlvbnNcbiAgICAgICAgICAgIGZvciAodmFyIG9wdGlvbiBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICAgICAgLy8gaWYgdGhpcyBvcHRpb24gZXhpc3RzIGZvciB0aGlzIGFjdGlvblxuICAgICAgICAgICAgICAgIGlmIChvcHRpb24gaW4gZGVmYXVsdE9wdGlvbnNbYWN0aW9uXSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBpZiB0aGUgb3B0aW9uIGluIHRoZSBvcHRpb25zIGFyZyBpcyBhbiBvYmplY3QgdmFsdWVcbiAgICAgICAgICAgICAgICAgICAgaWYgKGlzT2JqZWN0KG9wdGlvbnNbb3B0aW9uXSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGR1cGxpY2F0ZSB0aGUgb2JqZWN0XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnNbYWN0aW9uXVtvcHRpb25dID0gZXh0ZW5kKHRoaXMub3B0aW9uc1thY3Rpb25dW29wdGlvbl0gfHwge30sIG9wdGlvbnNbb3B0aW9uXSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpc09iamVjdChkZWZhdWx0T3B0aW9ucy5wZXJBY3Rpb25bb3B0aW9uXSkgJiYgJ2VuYWJsZWQnIGluIGRlZmF1bHRPcHRpb25zLnBlckFjdGlvbltvcHRpb25dKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zW2FjdGlvbl1bb3B0aW9uXS5lbmFibGVkID0gb3B0aW9uc1tvcHRpb25dLmVuYWJsZWQgPT09IGZhbHNlPyBmYWxzZSA6IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAoaXNCb29sKG9wdGlvbnNbb3B0aW9uXSkgJiYgaXNPYmplY3QoZGVmYXVsdE9wdGlvbnMucGVyQWN0aW9uW29wdGlvbl0pKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnNbYWN0aW9uXVtvcHRpb25dLmVuYWJsZWQgPSBvcHRpb25zW29wdGlvbl07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAob3B0aW9uc1tvcHRpb25dICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIG9yIGlmIGl0J3Mgbm90IHVuZGVmaW5lZCwgZG8gYSBwbGFpbiBhc3NpZ25tZW50XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnNbYWN0aW9uXVtvcHRpb25dID0gb3B0aW9uc1tvcHRpb25dO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIC8qXFxcbiAgICAgICAgICogSW50ZXJhY3RhYmxlLmRyb3B6b25lXG4gICAgICAgICBbIG1ldGhvZCBdXG4gICAgICAgICAqXG4gICAgICAgICAqIFJldHVybnMgb3Igc2V0cyB3aGV0aGVyIGVsZW1lbnRzIGNhbiBiZSBkcm9wcGVkIG9udG8gdGhpc1xuICAgICAgICAgKiBJbnRlcmFjdGFibGUgdG8gdHJpZ2dlciBkcm9wIGV2ZW50c1xuICAgICAgICAgKlxuICAgICAgICAgKiBEcm9wem9uZXMgY2FuIHJlY2VpdmUgdGhlIGZvbGxvd2luZyBldmVudHM6XG4gICAgICAgICAqICAtIGBkcm9wYWN0aXZhdGVgIGFuZCBgZHJvcGRlYWN0aXZhdGVgIHdoZW4gYW4gYWNjZXB0YWJsZSBkcmFnIHN0YXJ0cyBhbmQgZW5kc1xuICAgICAgICAgKiAgLSBgZHJhZ2VudGVyYCBhbmQgYGRyYWdsZWF2ZWAgd2hlbiBhIGRyYWdnYWJsZSBlbnRlcnMgYW5kIGxlYXZlcyB0aGUgZHJvcHpvbmVcbiAgICAgICAgICogIC0gYGRyYWdtb3ZlYCB3aGVuIGEgZHJhZ2dhYmxlIHRoYXQgaGFzIGVudGVyZWQgdGhlIGRyb3B6b25lIGlzIG1vdmVkXG4gICAgICAgICAqICAtIGBkcm9wYCB3aGVuIGEgZHJhZ2dhYmxlIGlzIGRyb3BwZWQgaW50byB0aGlzIGRyb3B6b25lXG4gICAgICAgICAqXG4gICAgICAgICAqICBVc2UgdGhlIGBhY2NlcHRgIG9wdGlvbiB0byBhbGxvdyBvbmx5IGVsZW1lbnRzIHRoYXQgbWF0Y2ggdGhlIGdpdmVuIENTUyBzZWxlY3RvciBvciBlbGVtZW50LlxuICAgICAgICAgKlxuICAgICAgICAgKiAgVXNlIHRoZSBgb3ZlcmxhcGAgb3B0aW9uIHRvIHNldCBob3cgZHJvcHMgYXJlIGNoZWNrZWQgZm9yLiBUaGUgYWxsb3dlZCB2YWx1ZXMgYXJlOlxuICAgICAgICAgKiAgIC0gYCdwb2ludGVyJ2AsIHRoZSBwb2ludGVyIG11c3QgYmUgb3ZlciB0aGUgZHJvcHpvbmUgKGRlZmF1bHQpXG4gICAgICAgICAqICAgLSBgJ2NlbnRlcidgLCB0aGUgZHJhZ2dhYmxlIGVsZW1lbnQncyBjZW50ZXIgbXVzdCBiZSBvdmVyIHRoZSBkcm9wem9uZVxuICAgICAgICAgKiAgIC0gYSBudW1iZXIgZnJvbSAwLTEgd2hpY2ggaXMgdGhlIGAoaW50ZXJzZWN0aW9uIGFyZWEpIC8gKGRyYWdnYWJsZSBhcmVhKWAuXG4gICAgICAgICAqICAgICAgIGUuZy4gYDAuNWAgZm9yIGRyb3AgdG8gaGFwcGVuIHdoZW4gaGFsZiBvZiB0aGUgYXJlYSBvZiB0aGVcbiAgICAgICAgICogICAgICAgZHJhZ2dhYmxlIGlzIG92ZXIgdGhlIGRyb3B6b25lXG4gICAgICAgICAqXG4gICAgICAgICAtIG9wdGlvbnMgKGJvb2xlYW4gfCBvYmplY3QgfCBudWxsKSAjb3B0aW9uYWwgVGhlIG5ldyB2YWx1ZSB0byBiZSBzZXQuXG4gICAgICAgICB8IGludGVyYWN0KCcuZHJvcCcpLmRyb3B6b25lKHtcbiAgICAgICAgIHwgICBhY2NlcHQ6ICcuY2FuLWRyb3AnIHx8IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaW5nbGUtZHJvcCcpLFxuICAgICAgICAgfCAgIG92ZXJsYXA6ICdwb2ludGVyJyB8fCAnY2VudGVyJyB8fCB6ZXJvVG9PbmVcbiAgICAgICAgIHwgfVxuICAgICAgICAgPSAoYm9vbGVhbiB8IG9iamVjdCkgVGhlIGN1cnJlbnQgc2V0dGluZyBvciB0aGlzIEludGVyYWN0YWJsZVxuICAgICAgICBcXCovXG4gICAgICAgIGRyb3B6b25lOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgaWYgKGlzT2JqZWN0KG9wdGlvbnMpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLmRyb3AuZW5hYmxlZCA9IG9wdGlvbnMuZW5hYmxlZCA9PT0gZmFsc2U/IGZhbHNlOiB0cnVlO1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0T25FdmVudHMoJ2Ryb3AnLCBvcHRpb25zKTtcblxuICAgICAgICAgICAgICAgIGlmICgvXihwb2ludGVyfGNlbnRlcikkLy50ZXN0KG9wdGlvbnMub3ZlcmxhcCkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLmRyb3Aub3ZlcmxhcCA9IG9wdGlvbnMub3ZlcmxhcDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoaXNOdW1iZXIob3B0aW9ucy5vdmVybGFwKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMuZHJvcC5vdmVybGFwID0gTWF0aC5tYXgoTWF0aC5taW4oMSwgb3B0aW9ucy5vdmVybGFwKSwgMCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICgnYWNjZXB0JyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMuZHJvcC5hY2NlcHQgPSBvcHRpb25zLmFjY2VwdDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKCdjaGVja2VyJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMuZHJvcC5jaGVja2VyID0gb3B0aW9ucy5jaGVja2VyO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoaXNCb29sKG9wdGlvbnMpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLmRyb3AuZW5hYmxlZCA9IG9wdGlvbnM7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRoaXMub3B0aW9ucy5kcm9wO1xuICAgICAgICB9LFxuXG4gICAgICAgIGRyb3BDaGVjazogZnVuY3Rpb24gKGRyYWdFdmVudCwgZXZlbnQsIGRyYWdnYWJsZSwgZHJhZ2dhYmxlRWxlbWVudCwgZHJvcEVsZW1lbnQsIHJlY3QpIHtcbiAgICAgICAgICAgIHZhciBkcm9wcGVkID0gZmFsc2U7XG5cbiAgICAgICAgICAgIC8vIGlmIHRoZSBkcm9wem9uZSBoYXMgbm8gcmVjdCAoZWcuIGRpc3BsYXk6IG5vbmUpXG4gICAgICAgICAgICAvLyBjYWxsIHRoZSBjdXN0b20gZHJvcENoZWNrZXIgb3IganVzdCByZXR1cm4gZmFsc2VcbiAgICAgICAgICAgIGlmICghKHJlY3QgPSByZWN0IHx8IHRoaXMuZ2V0UmVjdChkcm9wRWxlbWVudCkpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICh0aGlzLm9wdGlvbnMuZHJvcC5jaGVja2VyXG4gICAgICAgICAgICAgICAgICAgID8gdGhpcy5vcHRpb25zLmRyb3AuY2hlY2tlcihkcmFnRXZlbnQsIGV2ZW50LCBkcm9wcGVkLCB0aGlzLCBkcm9wRWxlbWVudCwgZHJhZ2dhYmxlLCBkcmFnZ2FibGVFbGVtZW50KVxuICAgICAgICAgICAgICAgICAgICA6IGZhbHNlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGRyb3BPdmVybGFwID0gdGhpcy5vcHRpb25zLmRyb3Aub3ZlcmxhcDtcblxuICAgICAgICAgICAgaWYgKGRyb3BPdmVybGFwID09PSAncG9pbnRlcicpIHtcbiAgICAgICAgICAgICAgICB2YXIgcGFnZSA9IGdldFBhZ2VYWShkcmFnRXZlbnQpLFxuICAgICAgICAgICAgICAgICAgICBvcmlnaW4gPSBnZXRPcmlnaW5YWShkcmFnZ2FibGUsIGRyYWdnYWJsZUVsZW1lbnQpLFxuICAgICAgICAgICAgICAgICAgICBob3Jpem9udGFsLFxuICAgICAgICAgICAgICAgICAgICB2ZXJ0aWNhbDtcblxuICAgICAgICAgICAgICAgIHBhZ2UueCArPSBvcmlnaW4ueDtcbiAgICAgICAgICAgICAgICBwYWdlLnkgKz0gb3JpZ2luLnk7XG5cbiAgICAgICAgICAgICAgICBob3Jpem9udGFsID0gKHBhZ2UueCA+IHJlY3QubGVmdCkgJiYgKHBhZ2UueCA8IHJlY3QucmlnaHQpO1xuICAgICAgICAgICAgICAgIHZlcnRpY2FsICAgPSAocGFnZS55ID4gcmVjdC50b3AgKSAmJiAocGFnZS55IDwgcmVjdC5ib3R0b20pO1xuXG4gICAgICAgICAgICAgICAgZHJvcHBlZCA9IGhvcml6b250YWwgJiYgdmVydGljYWw7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBkcmFnUmVjdCA9IGRyYWdnYWJsZS5nZXRSZWN0KGRyYWdnYWJsZUVsZW1lbnQpO1xuXG4gICAgICAgICAgICBpZiAoZHJvcE92ZXJsYXAgPT09ICdjZW50ZXInKSB7XG4gICAgICAgICAgICAgICAgdmFyIGN4ID0gZHJhZ1JlY3QubGVmdCArIGRyYWdSZWN0LndpZHRoICAvIDIsXG4gICAgICAgICAgICAgICAgICAgIGN5ID0gZHJhZ1JlY3QudG9wICArIGRyYWdSZWN0LmhlaWdodCAvIDI7XG5cbiAgICAgICAgICAgICAgICBkcm9wcGVkID0gY3ggPj0gcmVjdC5sZWZ0ICYmIGN4IDw9IHJlY3QucmlnaHQgJiYgY3kgPj0gcmVjdC50b3AgJiYgY3kgPD0gcmVjdC5ib3R0b207XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpc051bWJlcihkcm9wT3ZlcmxhcCkpIHtcbiAgICAgICAgICAgICAgICB2YXIgb3ZlcmxhcEFyZWEgID0gKE1hdGgubWF4KDAsIE1hdGgubWluKHJlY3QucmlnaHQgLCBkcmFnUmVjdC5yaWdodCApIC0gTWF0aC5tYXgocmVjdC5sZWZ0LCBkcmFnUmVjdC5sZWZ0KSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAqIE1hdGgubWF4KDAsIE1hdGgubWluKHJlY3QuYm90dG9tLCBkcmFnUmVjdC5ib3R0b20pIC0gTWF0aC5tYXgocmVjdC50b3AgLCBkcmFnUmVjdC50b3AgKSkpLFxuICAgICAgICAgICAgICAgICAgICBvdmVybGFwUmF0aW8gPSBvdmVybGFwQXJlYSAvIChkcmFnUmVjdC53aWR0aCAqIGRyYWdSZWN0LmhlaWdodCk7XG5cbiAgICAgICAgICAgICAgICBkcm9wcGVkID0gb3ZlcmxhcFJhdGlvID49IGRyb3BPdmVybGFwO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodGhpcy5vcHRpb25zLmRyb3AuY2hlY2tlcikge1xuICAgICAgICAgICAgICAgIGRyb3BwZWQgPSB0aGlzLm9wdGlvbnMuZHJvcC5jaGVja2VyKGRyYWdFdmVudCwgZXZlbnQsIGRyb3BwZWQsIHRoaXMsIGRyb3BFbGVtZW50LCBkcmFnZ2FibGUsIGRyYWdnYWJsZUVsZW1lbnQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gZHJvcHBlZDtcbiAgICAgICAgfSxcblxuICAgICAgICAvKlxcXG4gICAgICAgICAqIEludGVyYWN0YWJsZS5kcm9wQ2hlY2tlclxuICAgICAgICAgWyBtZXRob2QgXVxuICAgICAgICAgKlxuICAgICAgICAgKiBERVBSRUNBVEVELiBVc2UgaW50ZXJhY3RhYmxlLmRyb3B6b25lKHsgY2hlY2tlcjogZnVuY3Rpb24uLi4gfSkgaW5zdGVhZC5cbiAgICAgICAgICpcbiAgICAgICAgICogR2V0cyBvciBzZXRzIHRoZSBmdW5jdGlvbiB1c2VkIHRvIGNoZWNrIGlmIGEgZHJhZ2dlZCBlbGVtZW50IGlzXG4gICAgICAgICAqIG92ZXIgdGhpcyBJbnRlcmFjdGFibGUuXG4gICAgICAgICAqXG4gICAgICAgICAtIGNoZWNrZXIgKGZ1bmN0aW9uKSAjb3B0aW9uYWwgVGhlIGZ1bmN0aW9uIHRoYXQgd2lsbCBiZSBjYWxsZWQgd2hlbiBjaGVja2luZyBmb3IgYSBkcm9wXG4gICAgICAgICA9IChGdW5jdGlvbiB8IEludGVyYWN0YWJsZSkgVGhlIGNoZWNrZXIgZnVuY3Rpb24gb3IgdGhpcyBJbnRlcmFjdGFibGVcbiAgICAgICAgICpcbiAgICAgICAgICogVGhlIGNoZWNrZXIgZnVuY3Rpb24gdGFrZXMgdGhlIGZvbGxvd2luZyBhcmd1bWVudHM6XG4gICAgICAgICAqXG4gICAgICAgICAtIGRyYWdFdmVudCAoSW50ZXJhY3RFdmVudCkgVGhlIHJlbGF0ZWQgZHJhZ21vdmUgb3IgZHJhZ2VuZCBldmVudFxuICAgICAgICAgLSBldmVudCAoVG91Y2hFdmVudCB8IFBvaW50ZXJFdmVudCB8IE1vdXNlRXZlbnQpIFRoZSB1c2VyIG1vdmUvdXAvZW5kIEV2ZW50IHJlbGF0ZWQgdG8gdGhlIGRyYWdFdmVudFxuICAgICAgICAgLSBkcm9wcGVkIChib29sZWFuKSBUaGUgdmFsdWUgZnJvbSB0aGUgZGVmYXVsdCBkcm9wIGNoZWNrZXJcbiAgICAgICAgIC0gZHJvcHpvbmUgKEludGVyYWN0YWJsZSkgVGhlIGRyb3B6b25lIGludGVyYWN0YWJsZVxuICAgICAgICAgLSBkcm9wRWxlbWVudCAoRWxlbWVudCkgVGhlIGRyb3B6b25lIGVsZW1lbnRcbiAgICAgICAgIC0gZHJhZ2dhYmxlIChJbnRlcmFjdGFibGUpIFRoZSBJbnRlcmFjdGFibGUgYmVpbmcgZHJhZ2dlZFxuICAgICAgICAgLSBkcmFnZ2FibGVFbGVtZW50IChFbGVtZW50KSBUaGUgYWN0dWFsIGVsZW1lbnQgdGhhdCdzIGJlaW5nIGRyYWdnZWRcbiAgICAgICAgICpcbiAgICAgICAgID4gVXNhZ2U6XG4gICAgICAgICB8IGludGVyYWN0KHRhcmdldClcbiAgICAgICAgIHwgLmRyb3BDaGVja2VyKGZ1bmN0aW9uKGRyYWdFdmVudCwgICAgICAgICAvLyByZWxhdGVkIGRyYWdtb3ZlIG9yIGRyYWdlbmQgZXZlbnRcbiAgICAgICAgIHwgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50LCAgICAgICAgICAgICAvLyBUb3VjaEV2ZW50L1BvaW50ZXJFdmVudC9Nb3VzZUV2ZW50XG4gICAgICAgICB8ICAgICAgICAgICAgICAgICAgICAgICBkcm9wcGVkLCAgICAgICAgICAgLy8gYm9vbCByZXN1bHQgb2YgdGhlIGRlZmF1bHQgY2hlY2tlclxuICAgICAgICAgfCAgICAgICAgICAgICAgICAgICAgICAgZHJvcHpvbmUsICAgICAgICAgIC8vIGRyb3B6b25lIEludGVyYWN0YWJsZVxuICAgICAgICAgfCAgICAgICAgICAgICAgICAgICAgICAgZHJvcEVsZW1lbnQsICAgICAgIC8vIGRyb3B6b25lIGVsZW1udFxuICAgICAgICAgfCAgICAgICAgICAgICAgICAgICAgICAgZHJhZ2dhYmxlLCAgICAgICAgIC8vIGRyYWdnYWJsZSBJbnRlcmFjdGFibGVcbiAgICAgICAgIHwgICAgICAgICAgICAgICAgICAgICAgIGRyYWdnYWJsZUVsZW1lbnQpIHsvLyBkcmFnZ2FibGUgZWxlbWVudFxuICAgICAgICAgfFxuICAgICAgICAgfCAgIHJldHVybiBkcm9wcGVkICYmIGV2ZW50LnRhcmdldC5oYXNBdHRyaWJ1dGUoJ2FsbG93LWRyb3AnKTtcbiAgICAgICAgIHwgfVxuICAgICAgICBcXCovXG4gICAgICAgIGRyb3BDaGVja2VyOiBmdW5jdGlvbiAoY2hlY2tlcikge1xuICAgICAgICAgICAgaWYgKGlzRnVuY3Rpb24oY2hlY2tlcikpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMuZHJvcC5jaGVja2VyID0gY2hlY2tlcjtcblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGNoZWNrZXIgPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBkZWxldGUgdGhpcy5vcHRpb25zLmdldFJlY3Q7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRoaXMub3B0aW9ucy5kcm9wLmNoZWNrZXI7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLypcXFxuICAgICAgICAgKiBJbnRlcmFjdGFibGUuYWNjZXB0XG4gICAgICAgICBbIG1ldGhvZCBdXG4gICAgICAgICAqXG4gICAgICAgICAqIERlcHJlY2F0ZWQuIGFkZCBhbiBgYWNjZXB0YCBwcm9wZXJ0eSB0byB0aGUgb3B0aW9ucyBvYmplY3QgcGFzc2VkIHRvXG4gICAgICAgICAqIEBJbnRlcmFjdGFibGUuZHJvcHpvbmUgaW5zdGVhZC5cbiAgICAgICAgICpcbiAgICAgICAgICogR2V0cyBvciBzZXRzIHRoZSBFbGVtZW50IG9yIENTUyBzZWxlY3RvciBtYXRjaCB0aGF0IHRoaXNcbiAgICAgICAgICogSW50ZXJhY3RhYmxlIGFjY2VwdHMgaWYgaXQgaXMgYSBkcm9wem9uZS5cbiAgICAgICAgICpcbiAgICAgICAgIC0gbmV3VmFsdWUgKEVsZW1lbnQgfCBzdHJpbmcgfCBudWxsKSAjb3B0aW9uYWxcbiAgICAgICAgICogSWYgaXQgaXMgYW4gRWxlbWVudCwgdGhlbiBvbmx5IHRoYXQgZWxlbWVudCBjYW4gYmUgZHJvcHBlZCBpbnRvIHRoaXMgZHJvcHpvbmUuXG4gICAgICAgICAqIElmIGl0IGlzIGEgc3RyaW5nLCB0aGUgZWxlbWVudCBiZWluZyBkcmFnZ2VkIG11c3QgbWF0Y2ggaXQgYXMgYSBzZWxlY3Rvci5cbiAgICAgICAgICogSWYgaXQgaXMgbnVsbCwgdGhlIGFjY2VwdCBvcHRpb25zIGlzIGNsZWFyZWQgLSBpdCBhY2NlcHRzIGFueSBlbGVtZW50LlxuICAgICAgICAgKlxuICAgICAgICAgPSAoc3RyaW5nIHwgRWxlbWVudCB8IG51bGwgfCBJbnRlcmFjdGFibGUpIFRoZSBjdXJyZW50IGFjY2VwdCBvcHRpb24gaWYgZ2l2ZW4gYHVuZGVmaW5lZGAgb3IgdGhpcyBJbnRlcmFjdGFibGVcbiAgICAgICAgXFwqL1xuICAgICAgICBhY2NlcHQ6IGZ1bmN0aW9uIChuZXdWYWx1ZSkge1xuICAgICAgICAgICAgaWYgKGlzRWxlbWVudChuZXdWYWx1ZSkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMuZHJvcC5hY2NlcHQgPSBuZXdWYWx1ZTtcblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyB0ZXN0IGlmIGl0IGlzIGEgdmFsaWQgQ1NTIHNlbGVjdG9yXG4gICAgICAgICAgICBpZiAodHJ5U2VsZWN0b3IobmV3VmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLmRyb3AuYWNjZXB0ID0gbmV3VmFsdWU7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKG5ld1ZhbHVlID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgZGVsZXRlIHRoaXMub3B0aW9ucy5kcm9wLmFjY2VwdDtcblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5vcHRpb25zLmRyb3AuYWNjZXB0O1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qXFxcbiAgICAgICAgICogSW50ZXJhY3RhYmxlLnJlc2l6YWJsZVxuICAgICAgICAgWyBtZXRob2QgXVxuICAgICAgICAgKlxuICAgICAgICAgKiBHZXRzIG9yIHNldHMgd2hldGhlciByZXNpemUgYWN0aW9ucyBjYW4gYmUgcGVyZm9ybWVkIG9uIHRoZVxuICAgICAgICAgKiBJbnRlcmFjdGFibGVcbiAgICAgICAgICpcbiAgICAgICAgID0gKGJvb2xlYW4pIEluZGljYXRlcyBpZiB0aGlzIGNhbiBiZSB0aGUgdGFyZ2V0IG9mIHJlc2l6ZSBlbGVtZW50c1xuICAgICAgICAgfCB2YXIgaXNSZXNpemVhYmxlID0gaW50ZXJhY3QoJ2lucHV0W3R5cGU9dGV4dF0nKS5yZXNpemFibGUoKTtcbiAgICAgICAgICogb3JcbiAgICAgICAgIC0gb3B0aW9ucyAoYm9vbGVhbiB8IG9iamVjdCkgI29wdGlvbmFsIHRydWUvZmFsc2Ugb3IgQW4gb2JqZWN0IHdpdGggZXZlbnQgbGlzdGVuZXJzIHRvIGJlIGZpcmVkIG9uIHJlc2l6ZSBldmVudHMgKG9iamVjdCBtYWtlcyB0aGUgSW50ZXJhY3RhYmxlIHJlc2l6YWJsZSlcbiAgICAgICAgID0gKG9iamVjdCkgVGhpcyBJbnRlcmFjdGFibGVcbiAgICAgICAgIHwgaW50ZXJhY3QoZWxlbWVudCkucmVzaXphYmxlKHtcbiAgICAgICAgIHwgICAgIG9uc3RhcnQ6IGZ1bmN0aW9uIChldmVudCkge30sXG4gICAgICAgICB8ICAgICBvbm1vdmUgOiBmdW5jdGlvbiAoZXZlbnQpIHt9LFxuICAgICAgICAgfCAgICAgb25lbmQgIDogZnVuY3Rpb24gKGV2ZW50KSB7fSxcbiAgICAgICAgIHxcbiAgICAgICAgIHwgICAgIGVkZ2VzOiB7XG4gICAgICAgICB8ICAgICAgIHRvcCAgIDogdHJ1ZSwgICAgICAgLy8gVXNlIHBvaW50ZXIgY29vcmRzIHRvIGNoZWNrIGZvciByZXNpemUuXG4gICAgICAgICB8ICAgICAgIGxlZnQgIDogZmFsc2UsICAgICAgLy8gRGlzYWJsZSByZXNpemluZyBmcm9tIGxlZnQgZWRnZS5cbiAgICAgICAgIHwgICAgICAgYm90dG9tOiAnLnJlc2l6ZS1zJywvLyBSZXNpemUgaWYgcG9pbnRlciB0YXJnZXQgbWF0Y2hlcyBzZWxlY3RvclxuICAgICAgICAgfCAgICAgICByaWdodCA6IGhhbmRsZUVsICAgIC8vIFJlc2l6ZSBpZiBwb2ludGVyIHRhcmdldCBpcyB0aGUgZ2l2ZW4gRWxlbWVudFxuICAgICAgICAgfCAgICAgfSxcbiAgICAgICAgIHxcbiAgICAgICAgIHwgICAgIC8vIFdpZHRoIGFuZCBoZWlnaHQgY2FuIGJlIGFkanVzdGVkIGluZGVwZW5kZW50bHkuIFdoZW4gYHRydWVgLCB3aWR0aCBhbmRcbiAgICAgICAgIHwgICAgIC8vIGhlaWdodCBhcmUgYWRqdXN0ZWQgYXQgYSAxOjEgcmF0aW8uXG4gICAgICAgICB8ICAgICBzcXVhcmU6IGZhbHNlLFxuICAgICAgICAgfFxuICAgICAgICAgfCAgICAgLy8gV2lkdGggYW5kIGhlaWdodCBjYW4gYmUgYWRqdXN0ZWQgaW5kZXBlbmRlbnRseS4gV2hlbiBgdHJ1ZWAsIHdpZHRoIGFuZFxuICAgICAgICAgfCAgICAgLy8gaGVpZ2h0IG1haW50YWluIHRoZSBhc3BlY3QgcmF0aW8gdGhleSBoYWQgd2hlbiByZXNpemluZyBzdGFydGVkLlxuICAgICAgICAgfCAgICAgcHJlc2VydmVBc3BlY3RSYXRpbzogZmFsc2UsXG4gICAgICAgICB8XG4gICAgICAgICB8ICAgICAvLyBhIHZhbHVlIG9mICdub25lJyB3aWxsIGxpbWl0IHRoZSByZXNpemUgcmVjdCB0byBhIG1pbmltdW0gb2YgMHgwXG4gICAgICAgICB8ICAgICAvLyAnbmVnYXRlJyB3aWxsIGFsbG93IHRoZSByZWN0IHRvIGhhdmUgbmVnYXRpdmUgd2lkdGgvaGVpZ2h0XG4gICAgICAgICB8ICAgICAvLyAncmVwb3NpdGlvbicgd2lsbCBrZWVwIHRoZSB3aWR0aC9oZWlnaHQgcG9zaXRpdmUgYnkgc3dhcHBpbmdcbiAgICAgICAgIHwgICAgIC8vIHRoZSB0b3AgYW5kIGJvdHRvbSBlZGdlcyBhbmQvb3Igc3dhcHBpbmcgdGhlIGxlZnQgYW5kIHJpZ2h0IGVkZ2VzXG4gICAgICAgICB8ICAgICBpbnZlcnQ6ICdub25lJyB8fCAnbmVnYXRlJyB8fCAncmVwb3NpdGlvbidcbiAgICAgICAgIHxcbiAgICAgICAgIHwgICAgIC8vIGxpbWl0IG11bHRpcGxlIHJlc2l6ZXMuXG4gICAgICAgICB8ICAgICAvLyBTZWUgdGhlIGV4cGxhbmF0aW9uIGluIHRoZSBASW50ZXJhY3RhYmxlLmRyYWdnYWJsZSBleGFtcGxlXG4gICAgICAgICB8ICAgICBtYXg6IEluZmluaXR5LFxuICAgICAgICAgfCAgICAgbWF4UGVyRWxlbWVudDogMSxcbiAgICAgICAgIHwgfSk7XG4gICAgICAgIFxcKi9cbiAgICAgICAgcmVzaXphYmxlOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgaWYgKGlzT2JqZWN0KG9wdGlvbnMpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLnJlc2l6ZS5lbmFibGVkID0gb3B0aW9ucy5lbmFibGVkID09PSBmYWxzZT8gZmFsc2U6IHRydWU7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRQZXJBY3Rpb24oJ3Jlc2l6ZScsIG9wdGlvbnMpO1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0T25FdmVudHMoJ3Jlc2l6ZScsIG9wdGlvbnMpO1xuXG4gICAgICAgICAgICAgICAgaWYgKC9eeCR8XnkkfF54eSQvLnRlc3Qob3B0aW9ucy5heGlzKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMucmVzaXplLmF4aXMgPSBvcHRpb25zLmF4aXM7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKG9wdGlvbnMuYXhpcyA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMucmVzaXplLmF4aXMgPSBkZWZhdWx0T3B0aW9ucy5yZXNpemUuYXhpcztcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoaXNCb29sKG9wdGlvbnMucHJlc2VydmVBc3BlY3RSYXRpbykpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLnJlc2l6ZS5wcmVzZXJ2ZUFzcGVjdFJhdGlvID0gb3B0aW9ucy5wcmVzZXJ2ZUFzcGVjdFJhdGlvO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChpc0Jvb2wob3B0aW9ucy5zcXVhcmUpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMub3B0aW9ucy5yZXNpemUuc3F1YXJlID0gb3B0aW9ucy5zcXVhcmU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaXNCb29sKG9wdGlvbnMpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLnJlc2l6ZS5lbmFibGVkID0gb3B0aW9ucztcblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMub3B0aW9ucy5yZXNpemU7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLypcXFxuICAgICAgICAgKiBJbnRlcmFjdGFibGUuc3F1YXJlUmVzaXplXG4gICAgICAgICBbIG1ldGhvZCBdXG4gICAgICAgICAqXG4gICAgICAgICAqIERlcHJlY2F0ZWQuIEFkZCBhIGBzcXVhcmU6IHRydWUgfHwgZmFsc2VgIHByb3BlcnR5IHRvIEBJbnRlcmFjdGFibGUucmVzaXphYmxlIGluc3RlYWRcbiAgICAgICAgICpcbiAgICAgICAgICogR2V0cyBvciBzZXRzIHdoZXRoZXIgcmVzaXppbmcgaXMgZm9yY2VkIDE6MSBhc3BlY3RcbiAgICAgICAgICpcbiAgICAgICAgID0gKGJvb2xlYW4pIEN1cnJlbnQgc2V0dGluZ1xuICAgICAgICAgKlxuICAgICAgICAgKiBvclxuICAgICAgICAgKlxuICAgICAgICAgLSBuZXdWYWx1ZSAoYm9vbGVhbikgI29wdGlvbmFsXG4gICAgICAgICA9IChvYmplY3QpIHRoaXMgSW50ZXJhY3RhYmxlXG4gICAgICAgIFxcKi9cbiAgICAgICAgc3F1YXJlUmVzaXplOiBmdW5jdGlvbiAobmV3VmFsdWUpIHtcbiAgICAgICAgICAgIGlmIChpc0Jvb2wobmV3VmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLnJlc2l6ZS5zcXVhcmUgPSBuZXdWYWx1ZTtcblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAobmV3VmFsdWUgPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBkZWxldGUgdGhpcy5vcHRpb25zLnJlc2l6ZS5zcXVhcmU7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRoaXMub3B0aW9ucy5yZXNpemUuc3F1YXJlO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qXFxcbiAgICAgICAgICogSW50ZXJhY3RhYmxlLmdlc3R1cmFibGVcbiAgICAgICAgIFsgbWV0aG9kIF1cbiAgICAgICAgICpcbiAgICAgICAgICogR2V0cyBvciBzZXRzIHdoZXRoZXIgbXVsdGl0b3VjaCBnZXN0dXJlcyBjYW4gYmUgcGVyZm9ybWVkIG9uIHRoZVxuICAgICAgICAgKiBJbnRlcmFjdGFibGUncyBlbGVtZW50XG4gICAgICAgICAqXG4gICAgICAgICA9IChib29sZWFuKSBJbmRpY2F0ZXMgaWYgdGhpcyBjYW4gYmUgdGhlIHRhcmdldCBvZiBnZXN0dXJlIGV2ZW50c1xuICAgICAgICAgfCB2YXIgaXNHZXN0dXJlYWJsZSA9IGludGVyYWN0KGVsZW1lbnQpLmdlc3R1cmFibGUoKTtcbiAgICAgICAgICogb3JcbiAgICAgICAgIC0gb3B0aW9ucyAoYm9vbGVhbiB8IG9iamVjdCkgI29wdGlvbmFsIHRydWUvZmFsc2Ugb3IgQW4gb2JqZWN0IHdpdGggZXZlbnQgbGlzdGVuZXJzIHRvIGJlIGZpcmVkIG9uIGdlc3R1cmUgZXZlbnRzIChtYWtlcyB0aGUgSW50ZXJhY3RhYmxlIGdlc3R1cmFibGUpXG4gICAgICAgICA9IChvYmplY3QpIHRoaXMgSW50ZXJhY3RhYmxlXG4gICAgICAgICB8IGludGVyYWN0KGVsZW1lbnQpLmdlc3R1cmFibGUoe1xuICAgICAgICAgfCAgICAgb25zdGFydDogZnVuY3Rpb24gKGV2ZW50KSB7fSxcbiAgICAgICAgIHwgICAgIG9ubW92ZSA6IGZ1bmN0aW9uIChldmVudCkge30sXG4gICAgICAgICB8ICAgICBvbmVuZCAgOiBmdW5jdGlvbiAoZXZlbnQpIHt9LFxuICAgICAgICAgfFxuICAgICAgICAgfCAgICAgLy8gbGltaXQgbXVsdGlwbGUgZ2VzdHVyZXMuXG4gICAgICAgICB8ICAgICAvLyBTZWUgdGhlIGV4cGxhbmF0aW9uIGluIEBJbnRlcmFjdGFibGUuZHJhZ2dhYmxlIGV4YW1wbGVcbiAgICAgICAgIHwgICAgIG1heDogSW5maW5pdHksXG4gICAgICAgICB8ICAgICBtYXhQZXJFbGVtZW50OiAxLFxuICAgICAgICAgfCB9KTtcbiAgICAgICAgXFwqL1xuICAgICAgICBnZXN0dXJhYmxlOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgaWYgKGlzT2JqZWN0KG9wdGlvbnMpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLmdlc3R1cmUuZW5hYmxlZCA9IG9wdGlvbnMuZW5hYmxlZCA9PT0gZmFsc2U/IGZhbHNlOiB0cnVlO1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0UGVyQWN0aW9uKCdnZXN0dXJlJywgb3B0aW9ucyk7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRPbkV2ZW50cygnZ2VzdHVyZScsIG9wdGlvbnMpO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpc0Jvb2wob3B0aW9ucykpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMuZ2VzdHVyZS5lbmFibGVkID0gb3B0aW9ucztcblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5vcHRpb25zLmdlc3R1cmU7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLypcXFxuICAgICAgICAgKiBJbnRlcmFjdGFibGUuYXV0b1Njcm9sbFxuICAgICAgICAgWyBtZXRob2QgXVxuICAgICAgICAgKipcbiAgICAgICAgICogRGVwcmVjYXRlZC4gQWRkIGFuIGBhdXRvc2Nyb2xsYCBwcm9wZXJ0eSB0byB0aGUgb3B0aW9ucyBvYmplY3RcbiAgICAgICAgICogcGFzc2VkIHRvIEBJbnRlcmFjdGFibGUuZHJhZ2dhYmxlIG9yIEBJbnRlcmFjdGFibGUucmVzaXphYmxlIGluc3RlYWQuXG4gICAgICAgICAqXG4gICAgICAgICAqIFJldHVybnMgb3Igc2V0cyB3aGV0aGVyIGRyYWdnaW5nIGFuZCByZXNpemluZyBuZWFyIHRoZSBlZGdlcyBvZiB0aGVcbiAgICAgICAgICogd2luZG93L2NvbnRhaW5lciB0cmlnZ2VyIGF1dG9TY3JvbGwgZm9yIHRoaXMgSW50ZXJhY3RhYmxlXG4gICAgICAgICAqXG4gICAgICAgICA9IChvYmplY3QpIE9iamVjdCB3aXRoIGF1dG9TY3JvbGwgcHJvcGVydGllc1xuICAgICAgICAgKlxuICAgICAgICAgKiBvclxuICAgICAgICAgKlxuICAgICAgICAgLSBvcHRpb25zIChvYmplY3QgfCBib29sZWFuKSAjb3B0aW9uYWxcbiAgICAgICAgICogb3B0aW9ucyBjYW4gYmU6XG4gICAgICAgICAqIC0gYW4gb2JqZWN0IHdpdGggbWFyZ2luLCBkaXN0YW5jZSBhbmQgaW50ZXJ2YWwgcHJvcGVydGllcyxcbiAgICAgICAgICogLSB0cnVlIG9yIGZhbHNlIHRvIGVuYWJsZSBvciBkaXNhYmxlIGF1dG9TY3JvbGwgb3JcbiAgICAgICAgID0gKEludGVyYWN0YWJsZSkgdGhpcyBJbnRlcmFjdGFibGVcbiAgICAgICAgXFwqL1xuICAgICAgICBhdXRvU2Nyb2xsOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgaWYgKGlzT2JqZWN0KG9wdGlvbnMpKSB7XG4gICAgICAgICAgICAgICAgb3B0aW9ucyA9IGV4dGVuZCh7IGFjdGlvbnM6IFsnZHJhZycsICdyZXNpemUnXX0sIG9wdGlvbnMpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoaXNCb29sKG9wdGlvbnMpKSB7XG4gICAgICAgICAgICAgICAgb3B0aW9ucyA9IHsgYWN0aW9uczogWydkcmFnJywgJ3Jlc2l6ZSddLCBlbmFibGVkOiBvcHRpb25zIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzLnNldE9wdGlvbnMoJ2F1dG9TY3JvbGwnLCBvcHRpb25zKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKlxcXG4gICAgICAgICAqIEludGVyYWN0YWJsZS5zbmFwXG4gICAgICAgICBbIG1ldGhvZCBdXG4gICAgICAgICAqKlxuICAgICAgICAgKiBEZXByZWNhdGVkLiBBZGQgYSBgc25hcGAgcHJvcGVydHkgdG8gdGhlIG9wdGlvbnMgb2JqZWN0IHBhc3NlZFxuICAgICAgICAgKiB0byBASW50ZXJhY3RhYmxlLmRyYWdnYWJsZSBvciBASW50ZXJhY3RhYmxlLnJlc2l6YWJsZSBpbnN0ZWFkLlxuICAgICAgICAgKlxuICAgICAgICAgKiBSZXR1cm5zIG9yIHNldHMgaWYgYW5kIGhvdyBhY3Rpb24gY29vcmRpbmF0ZXMgYXJlIHNuYXBwZWQuIEJ5XG4gICAgICAgICAqIGRlZmF1bHQsIHNuYXBwaW5nIGlzIHJlbGF0aXZlIHRvIHRoZSBwb2ludGVyIGNvb3JkaW5hdGVzLiBZb3UgY2FuXG4gICAgICAgICAqIGNoYW5nZSB0aGlzIGJ5IHNldHRpbmcgdGhlXG4gICAgICAgICAqIFtgZWxlbWVudE9yaWdpbmBdKGh0dHBzOi8vZ2l0aHViLmNvbS90YXllL2ludGVyYWN0LmpzL3B1bGwvNzIpLlxuICAgICAgICAgKipcbiAgICAgICAgID0gKGJvb2xlYW4gfCBvYmplY3QpIGBmYWxzZWAgaWYgc25hcCBpcyBkaXNhYmxlZDsgb2JqZWN0IHdpdGggc25hcCBwcm9wZXJ0aWVzIGlmIHNuYXAgaXMgZW5hYmxlZFxuICAgICAgICAgKipcbiAgICAgICAgICogb3JcbiAgICAgICAgICoqXG4gICAgICAgICAtIG9wdGlvbnMgKG9iamVjdCB8IGJvb2xlYW4gfCBudWxsKSAjb3B0aW9uYWxcbiAgICAgICAgID0gKEludGVyYWN0YWJsZSkgdGhpcyBJbnRlcmFjdGFibGVcbiAgICAgICAgID4gVXNhZ2VcbiAgICAgICAgIHwgaW50ZXJhY3QoZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI3RoaW5nJykpLnNuYXAoe1xuICAgICAgICAgfCAgICAgdGFyZ2V0czogW1xuICAgICAgICAgfCAgICAgICAgIC8vIHNuYXAgdG8gdGhpcyBzcGVjaWZpYyBwb2ludFxuICAgICAgICAgfCAgICAgICAgIHtcbiAgICAgICAgIHwgICAgICAgICAgICAgeDogMTAwLFxuICAgICAgICAgfCAgICAgICAgICAgICB5OiAxMDAsXG4gICAgICAgICB8ICAgICAgICAgICAgIHJhbmdlOiAyNVxuICAgICAgICAgfCAgICAgICAgIH0sXG4gICAgICAgICB8ICAgICAgICAgLy8gZ2l2ZSB0aGlzIGZ1bmN0aW9uIHRoZSB4IGFuZCB5IHBhZ2UgY29vcmRzIGFuZCBzbmFwIHRvIHRoZSBvYmplY3QgcmV0dXJuZWRcbiAgICAgICAgIHwgICAgICAgICBmdW5jdGlvbiAoeCwgeSkge1xuICAgICAgICAgfCAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgfCAgICAgICAgICAgICAgICAgeDogeCxcbiAgICAgICAgIHwgICAgICAgICAgICAgICAgIHk6ICg3NSArIDUwICogTWF0aC5zaW4oeCAqIDAuMDQpKSxcbiAgICAgICAgIHwgICAgICAgICAgICAgICAgIHJhbmdlOiA0MFxuICAgICAgICAgfCAgICAgICAgICAgICB9O1xuICAgICAgICAgfCAgICAgICAgIH0sXG4gICAgICAgICB8ICAgICAgICAgLy8gY3JlYXRlIGEgZnVuY3Rpb24gdGhhdCBzbmFwcyB0byBhIGdyaWRcbiAgICAgICAgIHwgICAgICAgICBpbnRlcmFjdC5jcmVhdGVTbmFwR3JpZCh7XG4gICAgICAgICB8ICAgICAgICAgICAgIHg6IDUwLFxuICAgICAgICAgfCAgICAgICAgICAgICB5OiA1MCxcbiAgICAgICAgIHwgICAgICAgICAgICAgcmFuZ2U6IDEwLCAgICAgICAgICAgICAgLy8gb3B0aW9uYWxcbiAgICAgICAgIHwgICAgICAgICAgICAgb2Zmc2V0OiB7IHg6IDUsIHk6IDEwIH0gLy8gb3B0aW9uYWxcbiAgICAgICAgIHwgICAgICAgICB9KVxuICAgICAgICAgfCAgICAgXSxcbiAgICAgICAgIHwgICAgIC8vIGRvIG5vdCBzbmFwIGR1cmluZyBub3JtYWwgbW92ZW1lbnQuXG4gICAgICAgICB8ICAgICAvLyBJbnN0ZWFkLCB0cmlnZ2VyIG9ubHkgb25lIHNuYXBwZWQgbW92ZSBldmVudFxuICAgICAgICAgfCAgICAgLy8gaW1tZWRpYXRlbHkgYmVmb3JlIHRoZSBlbmQgZXZlbnQuXG4gICAgICAgICB8ICAgICBlbmRPbmx5OiB0cnVlLFxuICAgICAgICAgfFxuICAgICAgICAgfCAgICAgcmVsYXRpdmVQb2ludHM6IFtcbiAgICAgICAgIHwgICAgICAgICB7IHg6IDAsIHk6IDAgfSwgIC8vIHNuYXAgcmVsYXRpdmUgdG8gdGhlIHRvcCBsZWZ0IG9mIHRoZSBlbGVtZW50XG4gICAgICAgICB8ICAgICAgICAgeyB4OiAxLCB5OiAxIH0sICAvLyBhbmQgYWxzbyB0byB0aGUgYm90dG9tIHJpZ2h0XG4gICAgICAgICB8ICAgICBdLCAgXG4gICAgICAgICB8XG4gICAgICAgICB8ICAgICAvLyBvZmZzZXQgdGhlIHNuYXAgdGFyZ2V0IGNvb3JkaW5hdGVzXG4gICAgICAgICB8ICAgICAvLyBjYW4gYmUgYW4gb2JqZWN0IHdpdGggeC95IG9yICdzdGFydENvb3JkcydcbiAgICAgICAgIHwgICAgIG9mZnNldDogeyB4OiA1MCwgeTogNTAgfVxuICAgICAgICAgfCAgIH1cbiAgICAgICAgIHwgfSk7XG4gICAgICAgIFxcKi9cbiAgICAgICAgc25hcDogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHZhciByZXQgPSB0aGlzLnNldE9wdGlvbnMoJ3NuYXAnLCBvcHRpb25zKTtcblxuICAgICAgICAgICAgaWYgKHJldCA9PT0gdGhpcykgeyByZXR1cm4gdGhpczsgfVxuXG4gICAgICAgICAgICByZXR1cm4gcmV0LmRyYWc7XG4gICAgICAgIH0sXG5cbiAgICAgICAgc2V0T3B0aW9uczogZnVuY3Rpb24gKG9wdGlvbiwgb3B0aW9ucykge1xuICAgICAgICAgICAgdmFyIGFjdGlvbnMgPSBvcHRpb25zICYmIGlzQXJyYXkob3B0aW9ucy5hY3Rpb25zKVxuICAgICAgICAgICAgICAgICAgICA/IG9wdGlvbnMuYWN0aW9uc1xuICAgICAgICAgICAgICAgICAgICA6IFsnZHJhZyddO1xuXG4gICAgICAgICAgICB2YXIgaTtcblxuICAgICAgICAgICAgaWYgKGlzT2JqZWN0KG9wdGlvbnMpIHx8IGlzQm9vbChvcHRpb25zKSkge1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBhY3Rpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBhY3Rpb24gPSAvcmVzaXplLy50ZXN0KGFjdGlvbnNbaV0pPyAncmVzaXplJyA6IGFjdGlvbnNbaV07XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFpc09iamVjdCh0aGlzLm9wdGlvbnNbYWN0aW9uXSkpIHsgY29udGludWU7IH1cblxuICAgICAgICAgICAgICAgICAgICB2YXIgdGhpc09wdGlvbiA9IHRoaXMub3B0aW9uc1thY3Rpb25dW29wdGlvbl07XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGlzT2JqZWN0KG9wdGlvbnMpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBleHRlbmQodGhpc09wdGlvbiwgb3B0aW9ucyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzT3B0aW9uLmVuYWJsZWQgPSBvcHRpb25zLmVuYWJsZWQgPT09IGZhbHNlPyBmYWxzZTogdHJ1ZTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG9wdGlvbiA9PT0gJ3NuYXAnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXNPcHRpb24ubW9kZSA9PT0gJ2dyaWQnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXNPcHRpb24udGFyZ2V0cyA9IFtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGludGVyYWN0LmNyZWF0ZVNuYXBHcmlkKGV4dGVuZCh7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb2Zmc2V0OiB0aGlzT3B0aW9uLmdyaWRPZmZzZXQgfHwgeyB4OiAwLCB5OiAwIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sIHRoaXNPcHRpb24uZ3JpZCB8fCB7fSkpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIF07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKHRoaXNPcHRpb24ubW9kZSA9PT0gJ2FuY2hvcicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpc09wdGlvbi50YXJnZXRzID0gdGhpc09wdGlvbi5hbmNob3JzO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbHNlIGlmICh0aGlzT3B0aW9uLm1vZGUgPT09ICdwYXRoJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzT3B0aW9uLnRhcmdldHMgPSB0aGlzT3B0aW9uLnBhdGhzO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICgnZWxlbWVudE9yaWdpbicgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzT3B0aW9uLnJlbGF0aXZlUG9pbnRzID0gW29wdGlvbnMuZWxlbWVudE9yaWdpbl07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKGlzQm9vbChvcHRpb25zKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpc09wdGlvbi5lbmFibGVkID0gb3B0aW9ucztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgcmV0ID0ge30sXG4gICAgICAgICAgICAgICAgYWxsQWN0aW9ucyA9IFsnZHJhZycsICdyZXNpemUnLCAnZ2VzdHVyZSddO1xuXG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgYWxsQWN0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGlmIChvcHRpb24gaW4gZGVmYXVsdE9wdGlvbnNbYWxsQWN0aW9uc1tpXV0pIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0W2FsbEFjdGlvbnNbaV1dID0gdGhpcy5vcHRpb25zW2FsbEFjdGlvbnNbaV1dW29wdGlvbl07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gcmV0O1xuICAgICAgICB9LFxuXG5cbiAgICAgICAgLypcXFxuICAgICAgICAgKiBJbnRlcmFjdGFibGUuaW5lcnRpYVxuICAgICAgICAgWyBtZXRob2QgXVxuICAgICAgICAgKipcbiAgICAgICAgICogRGVwcmVjYXRlZC4gQWRkIGFuIGBpbmVydGlhYCBwcm9wZXJ0eSB0byB0aGUgb3B0aW9ucyBvYmplY3QgcGFzc2VkXG4gICAgICAgICAqIHRvIEBJbnRlcmFjdGFibGUuZHJhZ2dhYmxlIG9yIEBJbnRlcmFjdGFibGUucmVzaXphYmxlIGluc3RlYWQuXG4gICAgICAgICAqXG4gICAgICAgICAqIFJldHVybnMgb3Igc2V0cyBpZiBhbmQgaG93IGV2ZW50cyBjb250aW51ZSB0byBydW4gYWZ0ZXIgdGhlIHBvaW50ZXIgaXMgcmVsZWFzZWRcbiAgICAgICAgICoqXG4gICAgICAgICA9IChib29sZWFuIHwgb2JqZWN0KSBgZmFsc2VgIGlmIGluZXJ0aWEgaXMgZGlzYWJsZWQ7IGBvYmplY3RgIHdpdGggaW5lcnRpYSBwcm9wZXJ0aWVzIGlmIGluZXJ0aWEgaXMgZW5hYmxlZFxuICAgICAgICAgKipcbiAgICAgICAgICogb3JcbiAgICAgICAgICoqXG4gICAgICAgICAtIG9wdGlvbnMgKG9iamVjdCB8IGJvb2xlYW4gfCBudWxsKSAjb3B0aW9uYWxcbiAgICAgICAgID0gKEludGVyYWN0YWJsZSkgdGhpcyBJbnRlcmFjdGFibGVcbiAgICAgICAgID4gVXNhZ2VcbiAgICAgICAgIHwgLy8gZW5hYmxlIGFuZCB1c2UgZGVmYXVsdCBzZXR0aW5nc1xuICAgICAgICAgfCBpbnRlcmFjdChlbGVtZW50KS5pbmVydGlhKHRydWUpO1xuICAgICAgICAgfFxuICAgICAgICAgfCAvLyBlbmFibGUgYW5kIHVzZSBjdXN0b20gc2V0dGluZ3NcbiAgICAgICAgIHwgaW50ZXJhY3QoZWxlbWVudCkuaW5lcnRpYSh7XG4gICAgICAgICB8ICAgICAvLyB2YWx1ZSBncmVhdGVyIHRoYW4gMFxuICAgICAgICAgfCAgICAgLy8gaGlnaCB2YWx1ZXMgc2xvdyB0aGUgb2JqZWN0IGRvd24gbW9yZSBxdWlja2x5XG4gICAgICAgICB8ICAgICByZXNpc3RhbmNlICAgICA6IDE2LFxuICAgICAgICAgfFxuICAgICAgICAgfCAgICAgLy8gdGhlIG1pbmltdW0gbGF1bmNoIHNwZWVkIChwaXhlbHMgcGVyIHNlY29uZCkgdGhhdCByZXN1bHRzIGluIGluZXJ0aWEgc3RhcnRcbiAgICAgICAgIHwgICAgIG1pblNwZWVkICAgICAgIDogMjAwLFxuICAgICAgICAgfFxuICAgICAgICAgfCAgICAgLy8gaW5lcnRpYSB3aWxsIHN0b3Agd2hlbiB0aGUgb2JqZWN0IHNsb3dzIGRvd24gdG8gdGhpcyBzcGVlZFxuICAgICAgICAgfCAgICAgZW5kU3BlZWQgICAgICAgOiAyMCxcbiAgICAgICAgIHxcbiAgICAgICAgIHwgICAgIC8vIGJvb2xlYW47IHNob3VsZCBhY3Rpb25zIGJlIHJlc3VtZWQgd2hlbiB0aGUgcG9pbnRlciBnb2VzIGRvd24gZHVyaW5nIGluZXJ0aWFcbiAgICAgICAgIHwgICAgIGFsbG93UmVzdW1lICAgIDogdHJ1ZSxcbiAgICAgICAgIHxcbiAgICAgICAgIHwgICAgIC8vIGJvb2xlYW47IHNob3VsZCB0aGUganVtcCB3aGVuIHJlc3VtaW5nIGZyb20gaW5lcnRpYSBiZSBpZ25vcmVkIGluIGV2ZW50LmR4L2R5XG4gICAgICAgICB8ICAgICB6ZXJvUmVzdW1lRGVsdGE6IGZhbHNlLFxuICAgICAgICAgfFxuICAgICAgICAgfCAgICAgLy8gaWYgc25hcC9yZXN0cmljdCBhcmUgc2V0IHRvIGJlIGVuZE9ubHkgYW5kIGluZXJ0aWEgaXMgZW5hYmxlZCwgcmVsZWFzaW5nXG4gICAgICAgICB8ICAgICAvLyB0aGUgcG9pbnRlciB3aXRob3V0IHRyaWdnZXJpbmcgaW5lcnRpYSB3aWxsIGFuaW1hdGUgZnJvbSB0aGUgcmVsZWFzZVxuICAgICAgICAgfCAgICAgLy8gcG9pbnQgdG8gdGhlIHNuYXBlZC9yZXN0cmljdGVkIHBvaW50IGluIHRoZSBnaXZlbiBhbW91bnQgb2YgdGltZSAobXMpXG4gICAgICAgICB8ICAgICBzbW9vdGhFbmREdXJhdGlvbjogMzAwLFxuICAgICAgICAgfFxuICAgICAgICAgfCAgICAgLy8gYW4gYXJyYXkgb2YgYWN0aW9uIHR5cGVzIHRoYXQgY2FuIGhhdmUgaW5lcnRpYSAobm8gZ2VzdHVyZSlcbiAgICAgICAgIHwgICAgIGFjdGlvbnMgICAgICAgIDogWydkcmFnJywgJ3Jlc2l6ZSddXG4gICAgICAgICB8IH0pO1xuICAgICAgICAgfFxuICAgICAgICAgfCAvLyByZXNldCBjdXN0b20gc2V0dGluZ3MgYW5kIHVzZSBhbGwgZGVmYXVsdHNcbiAgICAgICAgIHwgaW50ZXJhY3QoZWxlbWVudCkuaW5lcnRpYShudWxsKTtcbiAgICAgICAgXFwqL1xuICAgICAgICBpbmVydGlhOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgdmFyIHJldCA9IHRoaXMuc2V0T3B0aW9ucygnaW5lcnRpYScsIG9wdGlvbnMpO1xuXG4gICAgICAgICAgICBpZiAocmV0ID09PSB0aGlzKSB7IHJldHVybiB0aGlzOyB9XG5cbiAgICAgICAgICAgIHJldHVybiByZXQuZHJhZztcbiAgICAgICAgfSxcblxuICAgICAgICBnZXRBY3Rpb246IGZ1bmN0aW9uIChwb2ludGVyLCBldmVudCwgaW50ZXJhY3Rpb24sIGVsZW1lbnQpIHtcbiAgICAgICAgICAgIHZhciBhY3Rpb24gPSB0aGlzLmRlZmF1bHRBY3Rpb25DaGVja2VyKHBvaW50ZXIsIGludGVyYWN0aW9uLCBlbGVtZW50KTtcblxuICAgICAgICAgICAgaWYgKHRoaXMub3B0aW9ucy5hY3Rpb25DaGVja2VyKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMub3B0aW9ucy5hY3Rpb25DaGVja2VyKHBvaW50ZXIsIGV2ZW50LCBhY3Rpb24sIHRoaXMsIGVsZW1lbnQsIGludGVyYWN0aW9uKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGFjdGlvbjtcbiAgICAgICAgfSxcblxuICAgICAgICBkZWZhdWx0QWN0aW9uQ2hlY2tlcjogZGVmYXVsdEFjdGlvbkNoZWNrZXIsXG5cbiAgICAgICAgLypcXFxuICAgICAgICAgKiBJbnRlcmFjdGFibGUuYWN0aW9uQ2hlY2tlclxuICAgICAgICAgWyBtZXRob2QgXVxuICAgICAgICAgKlxuICAgICAgICAgKiBHZXRzIG9yIHNldHMgdGhlIGZ1bmN0aW9uIHVzZWQgdG8gY2hlY2sgYWN0aW9uIHRvIGJlIHBlcmZvcm1lZCBvblxuICAgICAgICAgKiBwb2ludGVyRG93blxuICAgICAgICAgKlxuICAgICAgICAgLSBjaGVja2VyIChmdW5jdGlvbiB8IG51bGwpICNvcHRpb25hbCBBIGZ1bmN0aW9uIHdoaWNoIHRha2VzIGEgcG9pbnRlciBldmVudCwgZGVmYXVsdEFjdGlvbiBzdHJpbmcsIGludGVyYWN0YWJsZSwgZWxlbWVudCBhbmQgaW50ZXJhY3Rpb24gYXMgcGFyYW1ldGVycyBhbmQgcmV0dXJucyBhbiBvYmplY3Qgd2l0aCBuYW1lIHByb3BlcnR5ICdkcmFnJyAncmVzaXplJyBvciAnZ2VzdHVyZScgYW5kIG9wdGlvbmFsbHkgYW4gYGVkZ2VzYCBvYmplY3Qgd2l0aCBib29sZWFuICd0b3AnLCAnbGVmdCcsICdib3R0b20nIGFuZCByaWdodCBwcm9wcy5cbiAgICAgICAgID0gKEZ1bmN0aW9uIHwgSW50ZXJhY3RhYmxlKSBUaGUgY2hlY2tlciBmdW5jdGlvbiBvciB0aGlzIEludGVyYWN0YWJsZVxuICAgICAgICAgKlxuICAgICAgICAgfCBpbnRlcmFjdCgnLnJlc2l6ZS1kcmFnJylcbiAgICAgICAgIHwgICAucmVzaXphYmxlKHRydWUpXG4gICAgICAgICB8ICAgLmRyYWdnYWJsZSh0cnVlKVxuICAgICAgICAgfCAgIC5hY3Rpb25DaGVja2VyKGZ1bmN0aW9uIChwb2ludGVyLCBldmVudCwgYWN0aW9uLCBpbnRlcmFjdGFibGUsIGVsZW1lbnQsIGludGVyYWN0aW9uKSB7XG4gICAgICAgICB8XG4gICAgICAgICB8ICAgaWYgKGludGVyYWN0Lm1hdGNoZXNTZWxlY3RvcihldmVudC50YXJnZXQsICcuZHJhZy1oYW5kbGUnKSB7XG4gICAgICAgICB8ICAgICAvLyBmb3JjZSBkcmFnIHdpdGggaGFuZGxlIHRhcmdldFxuICAgICAgICAgfCAgICAgYWN0aW9uLm5hbWUgPSBkcmFnO1xuICAgICAgICAgfCAgIH1cbiAgICAgICAgIHwgICBlbHNlIHtcbiAgICAgICAgIHwgICAgIC8vIHJlc2l6ZSBmcm9tIHRoZSB0b3AgYW5kIHJpZ2h0IGVkZ2VzXG4gICAgICAgICB8ICAgICBhY3Rpb24ubmFtZSAgPSAncmVzaXplJztcbiAgICAgICAgIHwgICAgIGFjdGlvbi5lZGdlcyA9IHsgdG9wOiB0cnVlLCByaWdodDogdHJ1ZSB9O1xuICAgICAgICAgfCAgIH1cbiAgICAgICAgIHxcbiAgICAgICAgIHwgICByZXR1cm4gYWN0aW9uO1xuICAgICAgICAgfCB9KTtcbiAgICAgICAgXFwqL1xuICAgICAgICBhY3Rpb25DaGVja2VyOiBmdW5jdGlvbiAoY2hlY2tlcikge1xuICAgICAgICAgICAgaWYgKGlzRnVuY3Rpb24oY2hlY2tlcikpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMuYWN0aW9uQ2hlY2tlciA9IGNoZWNrZXI7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGNoZWNrZXIgPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBkZWxldGUgdGhpcy5vcHRpb25zLmFjdGlvbkNoZWNrZXI7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRoaXMub3B0aW9ucy5hY3Rpb25DaGVja2VyO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qXFxcbiAgICAgICAgICogSW50ZXJhY3RhYmxlLmdldFJlY3RcbiAgICAgICAgIFsgbWV0aG9kIF1cbiAgICAgICAgICpcbiAgICAgICAgICogVGhlIGRlZmF1bHQgZnVuY3Rpb24gdG8gZ2V0IGFuIEludGVyYWN0YWJsZXMgYm91bmRpbmcgcmVjdC4gQ2FuIGJlXG4gICAgICAgICAqIG92ZXJyaWRkZW4gdXNpbmcgQEludGVyYWN0YWJsZS5yZWN0Q2hlY2tlci5cbiAgICAgICAgICpcbiAgICAgICAgIC0gZWxlbWVudCAoRWxlbWVudCkgI29wdGlvbmFsIFRoZSBlbGVtZW50IHRvIG1lYXN1cmUuXG4gICAgICAgICA9IChvYmplY3QpIFRoZSBvYmplY3QncyBib3VuZGluZyByZWN0YW5nbGUuXG4gICAgICAgICBvIHtcbiAgICAgICAgIG8gICAgIHRvcCAgIDogMCxcbiAgICAgICAgIG8gICAgIGxlZnQgIDogMCxcbiAgICAgICAgIG8gICAgIGJvdHRvbTogMCxcbiAgICAgICAgIG8gICAgIHJpZ2h0IDogMCxcbiAgICAgICAgIG8gICAgIHdpZHRoIDogMCxcbiAgICAgICAgIG8gICAgIGhlaWdodDogMFxuICAgICAgICAgbyB9XG4gICAgICAgIFxcKi9cbiAgICAgICAgZ2V0UmVjdDogZnVuY3Rpb24gcmVjdENoZWNrIChlbGVtZW50KSB7XG4gICAgICAgICAgICBlbGVtZW50ID0gZWxlbWVudCB8fCB0aGlzLl9lbGVtZW50O1xuXG4gICAgICAgICAgICBpZiAodGhpcy5zZWxlY3RvciAmJiAhKGlzRWxlbWVudChlbGVtZW50KSkpIHtcbiAgICAgICAgICAgICAgICBlbGVtZW50ID0gdGhpcy5fY29udGV4dC5xdWVyeVNlbGVjdG9yKHRoaXMuc2VsZWN0b3IpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gZ2V0RWxlbWVudFJlY3QoZWxlbWVudCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLypcXFxuICAgICAgICAgKiBJbnRlcmFjdGFibGUucmVjdENoZWNrZXJcbiAgICAgICAgIFsgbWV0aG9kIF1cbiAgICAgICAgICpcbiAgICAgICAgICogUmV0dXJucyBvciBzZXRzIHRoZSBmdW5jdGlvbiB1c2VkIHRvIGNhbGN1bGF0ZSB0aGUgaW50ZXJhY3RhYmxlJ3NcbiAgICAgICAgICogZWxlbWVudCdzIHJlY3RhbmdsZVxuICAgICAgICAgKlxuICAgICAgICAgLSBjaGVja2VyIChmdW5jdGlvbikgI29wdGlvbmFsIEEgZnVuY3Rpb24gd2hpY2ggcmV0dXJucyB0aGlzIEludGVyYWN0YWJsZSdzIGJvdW5kaW5nIHJlY3RhbmdsZS4gU2VlIEBJbnRlcmFjdGFibGUuZ2V0UmVjdFxuICAgICAgICAgPSAoZnVuY3Rpb24gfCBvYmplY3QpIFRoZSBjaGVja2VyIGZ1bmN0aW9uIG9yIHRoaXMgSW50ZXJhY3RhYmxlXG4gICAgICAgIFxcKi9cbiAgICAgICAgcmVjdENoZWNrZXI6IGZ1bmN0aW9uIChjaGVja2VyKSB7XG4gICAgICAgICAgICBpZiAoaXNGdW5jdGlvbihjaGVja2VyKSkge1xuICAgICAgICAgICAgICAgIHRoaXMuZ2V0UmVjdCA9IGNoZWNrZXI7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGNoZWNrZXIgPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBkZWxldGUgdGhpcy5vcHRpb25zLmdldFJlY3Q7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZ2V0UmVjdDtcbiAgICAgICAgfSxcblxuICAgICAgICAvKlxcXG4gICAgICAgICAqIEludGVyYWN0YWJsZS5zdHlsZUN1cnNvclxuICAgICAgICAgWyBtZXRob2QgXVxuICAgICAgICAgKlxuICAgICAgICAgKiBSZXR1cm5zIG9yIHNldHMgd2hldGhlciB0aGUgYWN0aW9uIHRoYXQgd291bGQgYmUgcGVyZm9ybWVkIHdoZW4gdGhlXG4gICAgICAgICAqIG1vdXNlIG9uIHRoZSBlbGVtZW50IGFyZSBjaGVja2VkIG9uIGBtb3VzZW1vdmVgIHNvIHRoYXQgdGhlIGN1cnNvclxuICAgICAgICAgKiBtYXkgYmUgc3R5bGVkIGFwcHJvcHJpYXRlbHlcbiAgICAgICAgICpcbiAgICAgICAgIC0gbmV3VmFsdWUgKGJvb2xlYW4pICNvcHRpb25hbFxuICAgICAgICAgPSAoYm9vbGVhbiB8IEludGVyYWN0YWJsZSkgVGhlIGN1cnJlbnQgc2V0dGluZyBvciB0aGlzIEludGVyYWN0YWJsZVxuICAgICAgICBcXCovXG4gICAgICAgIHN0eWxlQ3Vyc29yOiBmdW5jdGlvbiAobmV3VmFsdWUpIHtcbiAgICAgICAgICAgIGlmIChpc0Jvb2wobmV3VmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLnN0eWxlQ3Vyc29yID0gbmV3VmFsdWU7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKG5ld1ZhbHVlID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgZGVsZXRlIHRoaXMub3B0aW9ucy5zdHlsZUN1cnNvcjtcblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5vcHRpb25zLnN0eWxlQ3Vyc29yO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qXFxcbiAgICAgICAgICogSW50ZXJhY3RhYmxlLnByZXZlbnREZWZhdWx0XG4gICAgICAgICBbIG1ldGhvZCBdXG4gICAgICAgICAqXG4gICAgICAgICAqIFJldHVybnMgb3Igc2V0cyB3aGV0aGVyIHRvIHByZXZlbnQgdGhlIGJyb3dzZXIncyBkZWZhdWx0IGJlaGF2aW91clxuICAgICAgICAgKiBpbiByZXNwb25zZSB0byBwb2ludGVyIGV2ZW50cy4gQ2FuIGJlIHNldCB0bzpcbiAgICAgICAgICogIC0gYCdhbHdheXMnYCB0byBhbHdheXMgcHJldmVudFxuICAgICAgICAgKiAgLSBgJ25ldmVyJ2AgdG8gbmV2ZXIgcHJldmVudFxuICAgICAgICAgKiAgLSBgJ2F1dG8nYCB0byBsZXQgaW50ZXJhY3QuanMgdHJ5IHRvIGRldGVybWluZSB3aGF0IHdvdWxkIGJlIGJlc3RcbiAgICAgICAgICpcbiAgICAgICAgIC0gbmV3VmFsdWUgKHN0cmluZykgI29wdGlvbmFsIGB0cnVlYCwgYGZhbHNlYCBvciBgJ2F1dG8nYFxuICAgICAgICAgPSAoc3RyaW5nIHwgSW50ZXJhY3RhYmxlKSBUaGUgY3VycmVudCBzZXR0aW5nIG9yIHRoaXMgSW50ZXJhY3RhYmxlXG4gICAgICAgIFxcKi9cbiAgICAgICAgcHJldmVudERlZmF1bHQ6IGZ1bmN0aW9uIChuZXdWYWx1ZSkge1xuICAgICAgICAgICAgaWYgKC9eKGFsd2F5c3xuZXZlcnxhdXRvKSQvLnRlc3QobmV3VmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLnByZXZlbnREZWZhdWx0ID0gbmV3VmFsdWU7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpc0Jvb2wobmV3VmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLnByZXZlbnREZWZhdWx0ID0gbmV3VmFsdWU/ICdhbHdheXMnIDogJ25ldmVyJztcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRoaXMub3B0aW9ucy5wcmV2ZW50RGVmYXVsdDtcbiAgICAgICAgfSxcblxuICAgICAgICAvKlxcXG4gICAgICAgICAqIEludGVyYWN0YWJsZS5vcmlnaW5cbiAgICAgICAgIFsgbWV0aG9kIF1cbiAgICAgICAgICpcbiAgICAgICAgICogR2V0cyBvciBzZXRzIHRoZSBvcmlnaW4gb2YgdGhlIEludGVyYWN0YWJsZSdzIGVsZW1lbnQuICBUaGUgeCBhbmQgeVxuICAgICAgICAgKiBvZiB0aGUgb3JpZ2luIHdpbGwgYmUgc3VidHJhY3RlZCBmcm9tIGFjdGlvbiBldmVudCBjb29yZGluYXRlcy5cbiAgICAgICAgICpcbiAgICAgICAgIC0gb3JpZ2luIChvYmplY3QgfCBzdHJpbmcpICNvcHRpb25hbCBBbiBvYmplY3QgZWcuIHsgeDogMCwgeTogMCB9IG9yIHN0cmluZyAncGFyZW50JywgJ3NlbGYnIG9yIGFueSBDU1Mgc2VsZWN0b3JcbiAgICAgICAgICogT1JcbiAgICAgICAgIC0gb3JpZ2luIChFbGVtZW50KSAjb3B0aW9uYWwgQW4gSFRNTCBvciBTVkcgRWxlbWVudCB3aG9zZSByZWN0IHdpbGwgYmUgdXNlZFxuICAgICAgICAgKipcbiAgICAgICAgID0gKG9iamVjdCkgVGhlIGN1cnJlbnQgb3JpZ2luIG9yIHRoaXMgSW50ZXJhY3RhYmxlXG4gICAgICAgIFxcKi9cbiAgICAgICAgb3JpZ2luOiBmdW5jdGlvbiAobmV3VmFsdWUpIHtcbiAgICAgICAgICAgIGlmICh0cnlTZWxlY3RvcihuZXdWYWx1ZSkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMub3JpZ2luID0gbmV3VmFsdWU7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChpc09iamVjdChuZXdWYWx1ZSkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMub3JpZ2luID0gbmV3VmFsdWU7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzLm9wdGlvbnMub3JpZ2luO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qXFxcbiAgICAgICAgICogSW50ZXJhY3RhYmxlLmRlbHRhU291cmNlXG4gICAgICAgICBbIG1ldGhvZCBdXG4gICAgICAgICAqXG4gICAgICAgICAqIFJldHVybnMgb3Igc2V0cyB0aGUgbW91c2UgY29vcmRpbmF0ZSB0eXBlcyB1c2VkIHRvIGNhbGN1bGF0ZSB0aGVcbiAgICAgICAgICogbW92ZW1lbnQgb2YgdGhlIHBvaW50ZXIuXG4gICAgICAgICAqXG4gICAgICAgICAtIG5ld1ZhbHVlIChzdHJpbmcpICNvcHRpb25hbCBVc2UgJ2NsaWVudCcgaWYgeW91IHdpbGwgYmUgc2Nyb2xsaW5nIHdoaWxlIGludGVyYWN0aW5nOyBVc2UgJ3BhZ2UnIGlmIHlvdSB3YW50IGF1dG9TY3JvbGwgdG8gd29ya1xuICAgICAgICAgPSAoc3RyaW5nIHwgb2JqZWN0KSBUaGUgY3VycmVudCBkZWx0YVNvdXJjZSBvciB0aGlzIEludGVyYWN0YWJsZVxuICAgICAgICBcXCovXG4gICAgICAgIGRlbHRhU291cmNlOiBmdW5jdGlvbiAobmV3VmFsdWUpIHtcbiAgICAgICAgICAgIGlmIChuZXdWYWx1ZSA9PT0gJ3BhZ2UnIHx8IG5ld1ZhbHVlID09PSAnY2xpZW50Jykge1xuICAgICAgICAgICAgICAgIHRoaXMub3B0aW9ucy5kZWx0YVNvdXJjZSA9IG5ld1ZhbHVlO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzLm9wdGlvbnMuZGVsdGFTb3VyY2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLypcXFxuICAgICAgICAgKiBJbnRlcmFjdGFibGUucmVzdHJpY3RcbiAgICAgICAgIFsgbWV0aG9kIF1cbiAgICAgICAgICoqXG4gICAgICAgICAqIERlcHJlY2F0ZWQuIEFkZCBhIGByZXN0cmljdGAgcHJvcGVydHkgdG8gdGhlIG9wdGlvbnMgb2JqZWN0IHBhc3NlZCB0b1xuICAgICAgICAgKiBASW50ZXJhY3RhYmxlLmRyYWdnYWJsZSwgQEludGVyYWN0YWJsZS5yZXNpemFibGUgb3IgQEludGVyYWN0YWJsZS5nZXN0dXJhYmxlIGluc3RlYWQuXG4gICAgICAgICAqXG4gICAgICAgICAqIFJldHVybnMgb3Igc2V0cyB0aGUgcmVjdGFuZ2xlcyB3aXRoaW4gd2hpY2ggYWN0aW9ucyBvbiB0aGlzXG4gICAgICAgICAqIGludGVyYWN0YWJsZSAoYWZ0ZXIgc25hcCBjYWxjdWxhdGlvbnMpIGFyZSByZXN0cmljdGVkLiBCeSBkZWZhdWx0LFxuICAgICAgICAgKiByZXN0cmljdGluZyBpcyByZWxhdGl2ZSB0byB0aGUgcG9pbnRlciBjb29yZGluYXRlcy4gWW91IGNhbiBjaGFuZ2VcbiAgICAgICAgICogdGhpcyBieSBzZXR0aW5nIHRoZVxuICAgICAgICAgKiBbYGVsZW1lbnRSZWN0YF0oaHR0cHM6Ly9naXRodWIuY29tL3RheWUvaW50ZXJhY3QuanMvcHVsbC83MikuXG4gICAgICAgICAqKlxuICAgICAgICAgLSBvcHRpb25zIChvYmplY3QpICNvcHRpb25hbCBhbiBvYmplY3Qgd2l0aCBrZXlzIGRyYWcsIHJlc2l6ZSwgYW5kL29yIGdlc3R1cmUgd2hvc2UgdmFsdWVzIGFyZSByZWN0cywgRWxlbWVudHMsIENTUyBzZWxlY3RvcnMsIG9yICdwYXJlbnQnIG9yICdzZWxmJ1xuICAgICAgICAgPSAob2JqZWN0KSBUaGUgY3VycmVudCByZXN0cmljdGlvbnMgb2JqZWN0IG9yIHRoaXMgSW50ZXJhY3RhYmxlXG4gICAgICAgICAqKlxuICAgICAgICAgfCBpbnRlcmFjdChlbGVtZW50KS5yZXN0cmljdCh7XG4gICAgICAgICB8ICAgICAvLyB0aGUgcmVjdCB3aWxsIGJlIGBpbnRlcmFjdC5nZXRFbGVtZW50UmVjdChlbGVtZW50LnBhcmVudE5vZGUpYFxuICAgICAgICAgfCAgICAgZHJhZzogZWxlbWVudC5wYXJlbnROb2RlLFxuICAgICAgICAgfFxuICAgICAgICAgfCAgICAgLy8geCBhbmQgeSBhcmUgcmVsYXRpdmUgdG8gdGhlIHRoZSBpbnRlcmFjdGFibGUncyBvcmlnaW5cbiAgICAgICAgIHwgICAgIHJlc2l6ZTogeyB4OiAxMDAsIHk6IDEwMCwgd2lkdGg6IDIwMCwgaGVpZ2h0OiAyMDAgfVxuICAgICAgICAgfCB9KVxuICAgICAgICAgfFxuICAgICAgICAgfCBpbnRlcmFjdCgnLmRyYWdnYWJsZScpLnJlc3RyaWN0KHtcbiAgICAgICAgIHwgICAgIC8vIHRoZSByZWN0IHdpbGwgYmUgdGhlIHNlbGVjdGVkIGVsZW1lbnQncyBwYXJlbnRcbiAgICAgICAgIHwgICAgIGRyYWc6ICdwYXJlbnQnLFxuICAgICAgICAgfFxuICAgICAgICAgfCAgICAgLy8gZG8gbm90IHJlc3RyaWN0IGR1cmluZyBub3JtYWwgbW92ZW1lbnQuXG4gICAgICAgICB8ICAgICAvLyBJbnN0ZWFkLCB0cmlnZ2VyIG9ubHkgb25lIHJlc3RyaWN0ZWQgbW92ZSBldmVudFxuICAgICAgICAgfCAgICAgLy8gaW1tZWRpYXRlbHkgYmVmb3JlIHRoZSBlbmQgZXZlbnQuXG4gICAgICAgICB8ICAgICBlbmRPbmx5OiB0cnVlLFxuICAgICAgICAgfFxuICAgICAgICAgfCAgICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL3RheWUvaW50ZXJhY3QuanMvcHVsbC83MiNpc3N1ZS00MTgxMzQ5M1xuICAgICAgICAgfCAgICAgZWxlbWVudFJlY3Q6IHsgdG9wOiAwLCBsZWZ0OiAwLCBib3R0b206IDEsIHJpZ2h0OiAxIH1cbiAgICAgICAgIHwgfSk7XG4gICAgICAgIFxcKi9cbiAgICAgICAgcmVzdHJpY3Q6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICBpZiAoIWlzT2JqZWN0KG9wdGlvbnMpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2V0T3B0aW9ucygncmVzdHJpY3QnLCBvcHRpb25zKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGFjdGlvbnMgPSBbJ2RyYWcnLCAncmVzaXplJywgJ2dlc3R1cmUnXSxcbiAgICAgICAgICAgICAgICByZXQ7XG5cbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYWN0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIHZhciBhY3Rpb24gPSBhY3Rpb25zW2ldO1xuXG4gICAgICAgICAgICAgICAgaWYgKGFjdGlvbiBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBwZXJBY3Rpb24gPSBleHRlbmQoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFjdGlvbnM6IFthY3Rpb25dLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3RyaWN0aW9uOiBvcHRpb25zW2FjdGlvbl1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0sIG9wdGlvbnMpO1xuXG4gICAgICAgICAgICAgICAgICAgIHJldCA9IHRoaXMuc2V0T3B0aW9ucygncmVzdHJpY3QnLCBwZXJBY3Rpb24pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHJldDtcbiAgICAgICAgfSxcblxuICAgICAgICAvKlxcXG4gICAgICAgICAqIEludGVyYWN0YWJsZS5jb250ZXh0XG4gICAgICAgICBbIG1ldGhvZCBdXG4gICAgICAgICAqXG4gICAgICAgICAqIEdldHMgdGhlIHNlbGVjdG9yIGNvbnRleHQgTm9kZSBvZiB0aGUgSW50ZXJhY3RhYmxlLiBUaGUgZGVmYXVsdCBpcyBgd2luZG93LmRvY3VtZW50YC5cbiAgICAgICAgICpcbiAgICAgICAgID0gKE5vZGUpIFRoZSBjb250ZXh0IE5vZGUgb2YgdGhpcyBJbnRlcmFjdGFibGVcbiAgICAgICAgICoqXG4gICAgICAgIFxcKi9cbiAgICAgICAgY29udGV4dDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2NvbnRleHQ7XG4gICAgICAgIH0sXG5cbiAgICAgICAgX2NvbnRleHQ6IGRvY3VtZW50LFxuXG4gICAgICAgIC8qXFxcbiAgICAgICAgICogSW50ZXJhY3RhYmxlLmlnbm9yZUZyb21cbiAgICAgICAgIFsgbWV0aG9kIF1cbiAgICAgICAgICpcbiAgICAgICAgICogSWYgdGhlIHRhcmdldCBvZiB0aGUgYG1vdXNlZG93bmAsIGBwb2ludGVyZG93bmAgb3IgYHRvdWNoc3RhcnRgXG4gICAgICAgICAqIGV2ZW50IG9yIGFueSBvZiBpdCdzIHBhcmVudHMgbWF0Y2ggdGhlIGdpdmVuIENTUyBzZWxlY3RvciBvclxuICAgICAgICAgKiBFbGVtZW50LCBubyBkcmFnL3Jlc2l6ZS9nZXN0dXJlIGlzIHN0YXJ0ZWQuXG4gICAgICAgICAqXG4gICAgICAgICAtIG5ld1ZhbHVlIChzdHJpbmcgfCBFbGVtZW50IHwgbnVsbCkgI29wdGlvbmFsIGEgQ1NTIHNlbGVjdG9yIHN0cmluZywgYW4gRWxlbWVudCBvciBgbnVsbGAgdG8gbm90IGlnbm9yZSBhbnkgZWxlbWVudHNcbiAgICAgICAgID0gKHN0cmluZyB8IEVsZW1lbnQgfCBvYmplY3QpIFRoZSBjdXJyZW50IGlnbm9yZUZyb20gdmFsdWUgb3IgdGhpcyBJbnRlcmFjdGFibGVcbiAgICAgICAgICoqXG4gICAgICAgICB8IGludGVyYWN0KGVsZW1lbnQsIHsgaWdub3JlRnJvbTogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ25vLWFjdGlvbicpIH0pO1xuICAgICAgICAgfCAvLyBvclxuICAgICAgICAgfCBpbnRlcmFjdChlbGVtZW50KS5pZ25vcmVGcm9tKCdpbnB1dCwgdGV4dGFyZWEsIGEnKTtcbiAgICAgICAgXFwqL1xuICAgICAgICBpZ25vcmVGcm9tOiBmdW5jdGlvbiAobmV3VmFsdWUpIHtcbiAgICAgICAgICAgIGlmICh0cnlTZWxlY3RvcihuZXdWYWx1ZSkpIHsgICAgICAgICAgICAvLyBDU1Mgc2VsZWN0b3IgdG8gbWF0Y2ggZXZlbnQudGFyZ2V0XG4gICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLmlnbm9yZUZyb20gPSBuZXdWYWx1ZTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGlzRWxlbWVudChuZXdWYWx1ZSkpIHsgICAgICAgICAgICAgIC8vIHNwZWNpZmljIGVsZW1lbnRcbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMuaWdub3JlRnJvbSA9IG5ld1ZhbHVlO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5vcHRpb25zLmlnbm9yZUZyb207XG4gICAgICAgIH0sXG5cbiAgICAgICAgLypcXFxuICAgICAgICAgKiBJbnRlcmFjdGFibGUuYWxsb3dGcm9tXG4gICAgICAgICBbIG1ldGhvZCBdXG4gICAgICAgICAqXG4gICAgICAgICAqIEEgZHJhZy9yZXNpemUvZ2VzdHVyZSBpcyBzdGFydGVkIG9ubHkgSWYgdGhlIHRhcmdldCBvZiB0aGVcbiAgICAgICAgICogYG1vdXNlZG93bmAsIGBwb2ludGVyZG93bmAgb3IgYHRvdWNoc3RhcnRgIGV2ZW50IG9yIGFueSBvZiBpdCdzXG4gICAgICAgICAqIHBhcmVudHMgbWF0Y2ggdGhlIGdpdmVuIENTUyBzZWxlY3RvciBvciBFbGVtZW50LlxuICAgICAgICAgKlxuICAgICAgICAgLSBuZXdWYWx1ZSAoc3RyaW5nIHwgRWxlbWVudCB8IG51bGwpICNvcHRpb25hbCBhIENTUyBzZWxlY3RvciBzdHJpbmcsIGFuIEVsZW1lbnQgb3IgYG51bGxgIHRvIGFsbG93IGZyb20gYW55IGVsZW1lbnRcbiAgICAgICAgID0gKHN0cmluZyB8IEVsZW1lbnQgfCBvYmplY3QpIFRoZSBjdXJyZW50IGFsbG93RnJvbSB2YWx1ZSBvciB0aGlzIEludGVyYWN0YWJsZVxuICAgICAgICAgKipcbiAgICAgICAgIHwgaW50ZXJhY3QoZWxlbWVudCwgeyBhbGxvd0Zyb206IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkcmFnLWhhbmRsZScpIH0pO1xuICAgICAgICAgfCAvLyBvclxuICAgICAgICAgfCBpbnRlcmFjdChlbGVtZW50KS5hbGxvd0Zyb20oJy5oYW5kbGUnKTtcbiAgICAgICAgXFwqL1xuICAgICAgICBhbGxvd0Zyb206IGZ1bmN0aW9uIChuZXdWYWx1ZSkge1xuICAgICAgICAgICAgaWYgKHRyeVNlbGVjdG9yKG5ld1ZhbHVlKSkgeyAgICAgICAgICAgIC8vIENTUyBzZWxlY3RvciB0byBtYXRjaCBldmVudC50YXJnZXRcbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMuYWxsb3dGcm9tID0gbmV3VmFsdWU7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpc0VsZW1lbnQobmV3VmFsdWUpKSB7ICAgICAgICAgICAgICAvLyBzcGVjaWZpYyBlbGVtZW50XG4gICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLmFsbG93RnJvbSA9IG5ld1ZhbHVlO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5vcHRpb25zLmFsbG93RnJvbTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKlxcXG4gICAgICAgICAqIEludGVyYWN0YWJsZS5lbGVtZW50XG4gICAgICAgICBbIG1ldGhvZCBdXG4gICAgICAgICAqXG4gICAgICAgICAqIElmIHRoaXMgaXMgbm90IGEgc2VsZWN0b3IgSW50ZXJhY3RhYmxlLCBpdCByZXR1cm5zIHRoZSBlbGVtZW50IHRoaXNcbiAgICAgICAgICogaW50ZXJhY3RhYmxlIHJlcHJlc2VudHNcbiAgICAgICAgICpcbiAgICAgICAgID0gKEVsZW1lbnQpIEhUTUwgLyBTVkcgRWxlbWVudFxuICAgICAgICBcXCovXG4gICAgICAgIGVsZW1lbnQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9lbGVtZW50O1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qXFxcbiAgICAgICAgICogSW50ZXJhY3RhYmxlLmZpcmVcbiAgICAgICAgIFsgbWV0aG9kIF1cbiAgICAgICAgICpcbiAgICAgICAgICogQ2FsbHMgbGlzdGVuZXJzIGZvciB0aGUgZ2l2ZW4gSW50ZXJhY3RFdmVudCB0eXBlIGJvdW5kIGdsb2JhbGx5XG4gICAgICAgICAqIGFuZCBkaXJlY3RseSB0byB0aGlzIEludGVyYWN0YWJsZVxuICAgICAgICAgKlxuICAgICAgICAgLSBpRXZlbnQgKEludGVyYWN0RXZlbnQpIFRoZSBJbnRlcmFjdEV2ZW50IG9iamVjdCB0byBiZSBmaXJlZCBvbiB0aGlzIEludGVyYWN0YWJsZVxuICAgICAgICAgPSAoSW50ZXJhY3RhYmxlKSB0aGlzIEludGVyYWN0YWJsZVxuICAgICAgICBcXCovXG4gICAgICAgIGZpcmU6IGZ1bmN0aW9uIChpRXZlbnQpIHtcbiAgICAgICAgICAgIGlmICghKGlFdmVudCAmJiBpRXZlbnQudHlwZSkgfHwgIWNvbnRhaW5zKGV2ZW50VHlwZXMsIGlFdmVudC50eXBlKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgbGlzdGVuZXJzLFxuICAgICAgICAgICAgICAgIGksXG4gICAgICAgICAgICAgICAgbGVuLFxuICAgICAgICAgICAgICAgIG9uRXZlbnQgPSAnb24nICsgaUV2ZW50LnR5cGUsXG4gICAgICAgICAgICAgICAgZnVuY05hbWUgPSAnJztcblxuICAgICAgICAgICAgLy8gSW50ZXJhY3RhYmxlI29uKCkgbGlzdGVuZXJzXG4gICAgICAgICAgICBpZiAoaUV2ZW50LnR5cGUgaW4gdGhpcy5faUV2ZW50cykge1xuICAgICAgICAgICAgICAgIGxpc3RlbmVycyA9IHRoaXMuX2lFdmVudHNbaUV2ZW50LnR5cGVdO1xuXG4gICAgICAgICAgICAgICAgZm9yIChpID0gMCwgbGVuID0gbGlzdGVuZXJzLmxlbmd0aDsgaSA8IGxlbiAmJiAhaUV2ZW50LmltbWVkaWF0ZVByb3BhZ2F0aW9uU3RvcHBlZDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGZ1bmNOYW1lID0gbGlzdGVuZXJzW2ldLm5hbWU7XG4gICAgICAgICAgICAgICAgICAgIGxpc3RlbmVyc1tpXShpRXZlbnQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gaW50ZXJhY3RhYmxlLm9uZXZlbnQgbGlzdGVuZXJcbiAgICAgICAgICAgIGlmIChpc0Z1bmN0aW9uKHRoaXNbb25FdmVudF0pKSB7XG4gICAgICAgICAgICAgICAgZnVuY05hbWUgPSB0aGlzW29uRXZlbnRdLm5hbWU7XG4gICAgICAgICAgICAgICAgdGhpc1tvbkV2ZW50XShpRXZlbnQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBpbnRlcmFjdC5vbigpIGxpc3RlbmVyc1xuICAgICAgICAgICAgaWYgKGlFdmVudC50eXBlIGluIGdsb2JhbEV2ZW50cyAmJiAobGlzdGVuZXJzID0gZ2xvYmFsRXZlbnRzW2lFdmVudC50eXBlXSkpICB7XG5cbiAgICAgICAgICAgICAgICBmb3IgKGkgPSAwLCBsZW4gPSBsaXN0ZW5lcnMubGVuZ3RoOyBpIDwgbGVuICYmICFpRXZlbnQuaW1tZWRpYXRlUHJvcGFnYXRpb25TdG9wcGVkOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgZnVuY05hbWUgPSBsaXN0ZW5lcnNbaV0ubmFtZTtcbiAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXJzW2ldKGlFdmVudCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfSxcblxuICAgICAgICAvKlxcXG4gICAgICAgICAqIEludGVyYWN0YWJsZS5vblxuICAgICAgICAgWyBtZXRob2QgXVxuICAgICAgICAgKlxuICAgICAgICAgKiBCaW5kcyBhIGxpc3RlbmVyIGZvciBhbiBJbnRlcmFjdEV2ZW50IG9yIERPTSBldmVudC5cbiAgICAgICAgICpcbiAgICAgICAgIC0gZXZlbnRUeXBlICAoc3RyaW5nIHwgYXJyYXkgfCBvYmplY3QpIFRoZSB0eXBlcyBvZiBldmVudHMgdG8gbGlzdGVuIGZvclxuICAgICAgICAgLSBsaXN0ZW5lciAgIChmdW5jdGlvbikgVGhlIGZ1bmN0aW9uIHRvIGJlIGNhbGxlZCBvbiB0aGUgZ2l2ZW4gZXZlbnQocylcbiAgICAgICAgIC0gdXNlQ2FwdHVyZSAoYm9vbGVhbikgI29wdGlvbmFsIHVzZUNhcHR1cmUgZmxhZyBmb3IgYWRkRXZlbnRMaXN0ZW5lclxuICAgICAgICAgPSAob2JqZWN0KSBUaGlzIEludGVyYWN0YWJsZVxuICAgICAgICBcXCovXG4gICAgICAgIG9uOiBmdW5jdGlvbiAoZXZlbnRUeXBlLCBsaXN0ZW5lciwgdXNlQ2FwdHVyZSkge1xuICAgICAgICAgICAgdmFyIGk7XG5cbiAgICAgICAgICAgIGlmIChpc1N0cmluZyhldmVudFR5cGUpICYmIGV2ZW50VHlwZS5zZWFyY2goJyAnKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICBldmVudFR5cGUgPSBldmVudFR5cGUudHJpbSgpLnNwbGl0KC8gKy8pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoaXNBcnJheShldmVudFR5cGUpKSB7XG4gICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGV2ZW50VHlwZS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLm9uKGV2ZW50VHlwZVtpXSwgbGlzdGVuZXIsIHVzZUNhcHR1cmUpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoaXNPYmplY3QoZXZlbnRUeXBlKSkge1xuICAgICAgICAgICAgICAgIGZvciAodmFyIHByb3AgaW4gZXZlbnRUeXBlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMub24ocHJvcCwgZXZlbnRUeXBlW3Byb3BdLCBsaXN0ZW5lcik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChldmVudFR5cGUgPT09ICd3aGVlbCcpIHtcbiAgICAgICAgICAgICAgICBldmVudFR5cGUgPSB3aGVlbEV2ZW50O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBjb252ZXJ0IHRvIGJvb2xlYW5cbiAgICAgICAgICAgIHVzZUNhcHR1cmUgPSB1c2VDYXB0dXJlPyB0cnVlOiBmYWxzZTtcblxuICAgICAgICAgICAgaWYgKGNvbnRhaW5zKGV2ZW50VHlwZXMsIGV2ZW50VHlwZSkpIHtcbiAgICAgICAgICAgICAgICAvLyBpZiB0aGlzIHR5cGUgb2YgZXZlbnQgd2FzIG5ldmVyIGJvdW5kIHRvIHRoaXMgSW50ZXJhY3RhYmxlXG4gICAgICAgICAgICAgICAgaWYgKCEoZXZlbnRUeXBlIGluIHRoaXMuX2lFdmVudHMpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2lFdmVudHNbZXZlbnRUeXBlXSA9IFtsaXN0ZW5lcl07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9pRXZlbnRzW2V2ZW50VHlwZV0ucHVzaChsaXN0ZW5lcik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gZGVsZWdhdGVkIGV2ZW50IGZvciBzZWxlY3RvclxuICAgICAgICAgICAgZWxzZSBpZiAodGhpcy5zZWxlY3Rvcikge1xuICAgICAgICAgICAgICAgIGlmICghZGVsZWdhdGVkRXZlbnRzW2V2ZW50VHlwZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgZGVsZWdhdGVkRXZlbnRzW2V2ZW50VHlwZV0gPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxlY3RvcnM6IFtdLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29udGV4dHMgOiBbXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpc3RlbmVyczogW11cbiAgICAgICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBhZGQgZGVsZWdhdGUgbGlzdGVuZXIgZnVuY3Rpb25zXG4gICAgICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBkb2N1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50cy5hZGQoZG9jdW1lbnRzW2ldLCBldmVudFR5cGUsIGRlbGVnYXRlTGlzdGVuZXIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnRzLmFkZChkb2N1bWVudHNbaV0sIGV2ZW50VHlwZSwgZGVsZWdhdGVVc2VDYXB0dXJlLCB0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHZhciBkZWxlZ2F0ZWQgPSBkZWxlZ2F0ZWRFdmVudHNbZXZlbnRUeXBlXSxcbiAgICAgICAgICAgICAgICAgICAgaW5kZXg7XG5cbiAgICAgICAgICAgICAgICBmb3IgKGluZGV4ID0gZGVsZWdhdGVkLnNlbGVjdG9ycy5sZW5ndGggLSAxOyBpbmRleCA+PSAwOyBpbmRleC0tKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChkZWxlZ2F0ZWQuc2VsZWN0b3JzW2luZGV4XSA9PT0gdGhpcy5zZWxlY3RvclxuICAgICAgICAgICAgICAgICAgICAgICAgJiYgZGVsZWdhdGVkLmNvbnRleHRzW2luZGV4XSA9PT0gdGhpcy5fY29udGV4dCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoaW5kZXggPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIGluZGV4ID0gZGVsZWdhdGVkLnNlbGVjdG9ycy5sZW5ndGg7XG5cbiAgICAgICAgICAgICAgICAgICAgZGVsZWdhdGVkLnNlbGVjdG9ycy5wdXNoKHRoaXMuc2VsZWN0b3IpO1xuICAgICAgICAgICAgICAgICAgICBkZWxlZ2F0ZWQuY29udGV4dHMgLnB1c2godGhpcy5fY29udGV4dCk7XG4gICAgICAgICAgICAgICAgICAgIGRlbGVnYXRlZC5saXN0ZW5lcnMucHVzaChbXSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8ga2VlcCBsaXN0ZW5lciBhbmQgdXNlQ2FwdHVyZSBmbGFnXG4gICAgICAgICAgICAgICAgZGVsZWdhdGVkLmxpc3RlbmVyc1tpbmRleF0ucHVzaChbbGlzdGVuZXIsIHVzZUNhcHR1cmVdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGV2ZW50cy5hZGQodGhpcy5fZWxlbWVudCwgZXZlbnRUeXBlLCBsaXN0ZW5lciwgdXNlQ2FwdHVyZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qXFxcbiAgICAgICAgICogSW50ZXJhY3RhYmxlLm9mZlxuICAgICAgICAgWyBtZXRob2QgXVxuICAgICAgICAgKlxuICAgICAgICAgKiBSZW1vdmVzIGFuIEludGVyYWN0RXZlbnQgb3IgRE9NIGV2ZW50IGxpc3RlbmVyXG4gICAgICAgICAqXG4gICAgICAgICAtIGV2ZW50VHlwZSAgKHN0cmluZyB8IGFycmF5IHwgb2JqZWN0KSBUaGUgdHlwZXMgb2YgZXZlbnRzIHRoYXQgd2VyZSBsaXN0ZW5lZCBmb3JcbiAgICAgICAgIC0gbGlzdGVuZXIgICAoZnVuY3Rpb24pIFRoZSBsaXN0ZW5lciBmdW5jdGlvbiB0byBiZSByZW1vdmVkXG4gICAgICAgICAtIHVzZUNhcHR1cmUgKGJvb2xlYW4pICNvcHRpb25hbCB1c2VDYXB0dXJlIGZsYWcgZm9yIHJlbW92ZUV2ZW50TGlzdGVuZXJcbiAgICAgICAgID0gKG9iamVjdCkgVGhpcyBJbnRlcmFjdGFibGVcbiAgICAgICAgXFwqL1xuICAgICAgICBvZmY6IGZ1bmN0aW9uIChldmVudFR5cGUsIGxpc3RlbmVyLCB1c2VDYXB0dXJlKSB7XG4gICAgICAgICAgICB2YXIgaTtcblxuICAgICAgICAgICAgaWYgKGlzU3RyaW5nKGV2ZW50VHlwZSkgJiYgZXZlbnRUeXBlLnNlYXJjaCgnICcpICE9PSAtMSkge1xuICAgICAgICAgICAgICAgIGV2ZW50VHlwZSA9IGV2ZW50VHlwZS50cmltKCkuc3BsaXQoLyArLyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpc0FycmF5KGV2ZW50VHlwZSkpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgZXZlbnRUeXBlLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMub2ZmKGV2ZW50VHlwZVtpXSwgbGlzdGVuZXIsIHVzZUNhcHR1cmUpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoaXNPYmplY3QoZXZlbnRUeXBlKSkge1xuICAgICAgICAgICAgICAgIGZvciAodmFyIHByb3AgaW4gZXZlbnRUeXBlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMub2ZmKHByb3AsIGV2ZW50VHlwZVtwcm9wXSwgbGlzdGVuZXIpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgZXZlbnRMaXN0LFxuICAgICAgICAgICAgICAgIGluZGV4ID0gLTE7XG5cbiAgICAgICAgICAgIC8vIGNvbnZlcnQgdG8gYm9vbGVhblxuICAgICAgICAgICAgdXNlQ2FwdHVyZSA9IHVzZUNhcHR1cmU/IHRydWU6IGZhbHNlO1xuXG4gICAgICAgICAgICBpZiAoZXZlbnRUeXBlID09PSAnd2hlZWwnKSB7XG4gICAgICAgICAgICAgICAgZXZlbnRUeXBlID0gd2hlZWxFdmVudDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gaWYgaXQgaXMgYW4gYWN0aW9uIGV2ZW50IHR5cGVcbiAgICAgICAgICAgIGlmIChjb250YWlucyhldmVudFR5cGVzLCBldmVudFR5cGUpKSB7XG4gICAgICAgICAgICAgICAgZXZlbnRMaXN0ID0gdGhpcy5faUV2ZW50c1tldmVudFR5cGVdO1xuXG4gICAgICAgICAgICAgICAgaWYgKGV2ZW50TGlzdCAmJiAoaW5kZXggPSBpbmRleE9mKGV2ZW50TGlzdCwgbGlzdGVuZXIpKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5faUV2ZW50c1tldmVudFR5cGVdLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gZGVsZWdhdGVkIGV2ZW50XG4gICAgICAgICAgICBlbHNlIGlmICh0aGlzLnNlbGVjdG9yKSB7XG4gICAgICAgICAgICAgICAgdmFyIGRlbGVnYXRlZCA9IGRlbGVnYXRlZEV2ZW50c1tldmVudFR5cGVdLFxuICAgICAgICAgICAgICAgICAgICBtYXRjaEZvdW5kID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgICBpZiAoIWRlbGVnYXRlZCkgeyByZXR1cm4gdGhpczsgfVxuXG4gICAgICAgICAgICAgICAgLy8gY291bnQgZnJvbSBsYXN0IGluZGV4IG9mIGRlbGVnYXRlZCB0byAwXG4gICAgICAgICAgICAgICAgZm9yIChpbmRleCA9IGRlbGVnYXRlZC5zZWxlY3RvcnMubGVuZ3RoIC0gMTsgaW5kZXggPj0gMDsgaW5kZXgtLSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBsb29rIGZvciBtYXRjaGluZyBzZWxlY3RvciBhbmQgY29udGV4dCBOb2RlXG4gICAgICAgICAgICAgICAgICAgIGlmIChkZWxlZ2F0ZWQuc2VsZWN0b3JzW2luZGV4XSA9PT0gdGhpcy5zZWxlY3RvclxuICAgICAgICAgICAgICAgICAgICAgICAgJiYgZGVsZWdhdGVkLmNvbnRleHRzW2luZGV4XSA9PT0gdGhpcy5fY29udGV4dCkge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgbGlzdGVuZXJzID0gZGVsZWdhdGVkLmxpc3RlbmVyc1tpbmRleF07XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGVhY2ggaXRlbSBvZiB0aGUgbGlzdGVuZXJzIGFycmF5IGlzIGFuIGFycmF5OiBbZnVuY3Rpb24sIHVzZUNhcHR1cmVGbGFnXVxuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChpID0gbGlzdGVuZXJzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGZuID0gbGlzdGVuZXJzW2ldWzBdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1c2VDYXAgPSBsaXN0ZW5lcnNbaV1bMV07XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBjaGVjayBpZiB0aGUgbGlzdGVuZXIgZnVuY3Rpb25zIGFuZCB1c2VDYXB0dXJlIGZsYWdzIG1hdGNoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGZuID09PSBsaXN0ZW5lciAmJiB1c2VDYXAgPT09IHVzZUNhcHR1cmUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gcmVtb3ZlIHRoZSBsaXN0ZW5lciBmcm9tIHRoZSBhcnJheSBvZiBsaXN0ZW5lcnNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXJzLnNwbGljZShpLCAxKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiBhbGwgbGlzdGVuZXJzIGZvciB0aGlzIGludGVyYWN0YWJsZSBoYXZlIGJlZW4gcmVtb3ZlZFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyByZW1vdmUgdGhlIGludGVyYWN0YWJsZSBmcm9tIHRoZSBkZWxlZ2F0ZWQgYXJyYXlzXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghbGlzdGVuZXJzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVsZWdhdGVkLnNlbGVjdG9ycy5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVsZWdhdGVkLmNvbnRleHRzIC5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVsZWdhdGVkLmxpc3RlbmVycy5zcGxpY2UoaW5kZXgsIDEpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyByZW1vdmUgZGVsZWdhdGUgZnVuY3Rpb24gZnJvbSBjb250ZXh0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBldmVudHMucmVtb3ZlKHRoaXMuX2NvbnRleHQsIGV2ZW50VHlwZSwgZGVsZWdhdGVMaXN0ZW5lcik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBldmVudHMucmVtb3ZlKHRoaXMuX2NvbnRleHQsIGV2ZW50VHlwZSwgZGVsZWdhdGVVc2VDYXB0dXJlLCB0cnVlKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gcmVtb3ZlIHRoZSBhcnJheXMgaWYgdGhleSBhcmUgZW1wdHlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghZGVsZWdhdGVkLnNlbGVjdG9ycy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWxlZ2F0ZWRFdmVudHNbZXZlbnRUeXBlXSA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBvbmx5IHJlbW92ZSBvbmUgbGlzdGVuZXJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWF0Y2hGb3VuZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG1hdGNoRm91bmQpIHsgYnJlYWs7IH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIHJlbW92ZSBsaXN0ZW5lciBmcm9tIHRoaXMgSW50ZXJhdGFibGUncyBlbGVtZW50XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBldmVudHMucmVtb3ZlKHRoaXMuX2VsZW1lbnQsIGV2ZW50VHlwZSwgbGlzdGVuZXIsIHVzZUNhcHR1cmUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfSxcblxuICAgICAgICAvKlxcXG4gICAgICAgICAqIEludGVyYWN0YWJsZS5zZXRcbiAgICAgICAgIFsgbWV0aG9kIF1cbiAgICAgICAgICpcbiAgICAgICAgICogUmVzZXQgdGhlIG9wdGlvbnMgb2YgdGhpcyBJbnRlcmFjdGFibGVcbiAgICAgICAgIC0gb3B0aW9ucyAob2JqZWN0KSBUaGUgbmV3IHNldHRpbmdzIHRvIGFwcGx5XG4gICAgICAgICA9IChvYmplY3QpIFRoaXMgSW50ZXJhY3RhYmxlXG4gICAgICAgIFxcKi9cbiAgICAgICAgc2V0OiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgaWYgKCFpc09iamVjdChvcHRpb25zKSkge1xuICAgICAgICAgICAgICAgIG9wdGlvbnMgPSB7fTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5vcHRpb25zID0gZXh0ZW5kKHt9LCBkZWZhdWx0T3B0aW9ucy5iYXNlKTtcblxuICAgICAgICAgICAgdmFyIGksXG4gICAgICAgICAgICAgICAgYWN0aW9ucyA9IFsnZHJhZycsICdkcm9wJywgJ3Jlc2l6ZScsICdnZXN0dXJlJ10sXG4gICAgICAgICAgICAgICAgbWV0aG9kcyA9IFsnZHJhZ2dhYmxlJywgJ2Ryb3B6b25lJywgJ3Jlc2l6YWJsZScsICdnZXN0dXJhYmxlJ10sXG4gICAgICAgICAgICAgICAgcGVyQWN0aW9ucyA9IGV4dGVuZChleHRlbmQoe30sIGRlZmF1bHRPcHRpb25zLnBlckFjdGlvbiksIG9wdGlvbnNbYWN0aW9uXSB8fCB7fSk7XG5cbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBhY3Rpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgdmFyIGFjdGlvbiA9IGFjdGlvbnNbaV07XG5cbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnNbYWN0aW9uXSA9IGV4dGVuZCh7fSwgZGVmYXVsdE9wdGlvbnNbYWN0aW9uXSk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLnNldFBlckFjdGlvbihhY3Rpb24sIHBlckFjdGlvbnMpO1xuXG4gICAgICAgICAgICAgICAgdGhpc1ttZXRob2RzW2ldXShvcHRpb25zW2FjdGlvbl0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgc2V0dGluZ3MgPSBbXG4gICAgICAgICAgICAgICAgICAgICdhY2NlcHQnLCAnYWN0aW9uQ2hlY2tlcicsICdhbGxvd0Zyb20nLCAnZGVsdGFTb3VyY2UnLFxuICAgICAgICAgICAgICAgICAgICAnZHJvcENoZWNrZXInLCAnaWdub3JlRnJvbScsICdvcmlnaW4nLCAncHJldmVudERlZmF1bHQnLFxuICAgICAgICAgICAgICAgICAgICAncmVjdENoZWNrZXInLCAnc3R5bGVDdXJzb3InXG4gICAgICAgICAgICAgICAgXTtcblxuICAgICAgICAgICAgZm9yIChpID0gMCwgbGVuID0gc2V0dGluZ3MubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgc2V0dGluZyA9IHNldHRpbmdzW2ldO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zW3NldHRpbmddID0gZGVmYXVsdE9wdGlvbnMuYmFzZVtzZXR0aW5nXTtcblxuICAgICAgICAgICAgICAgIGlmIChzZXR0aW5nIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpc1tzZXR0aW5nXShvcHRpb25zW3NldHRpbmddKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qXFxcbiAgICAgICAgICogSW50ZXJhY3RhYmxlLnVuc2V0XG4gICAgICAgICBbIG1ldGhvZCBdXG4gICAgICAgICAqXG4gICAgICAgICAqIFJlbW92ZSB0aGlzIGludGVyYWN0YWJsZSBmcm9tIHRoZSBsaXN0IG9mIGludGVyYWN0YWJsZXMgYW5kIHJlbW92ZVxuICAgICAgICAgKiBpdCdzIGRyYWcsIGRyb3AsIHJlc2l6ZSBhbmQgZ2VzdHVyZSBjYXBhYmlsaXRpZXNcbiAgICAgICAgICpcbiAgICAgICAgID0gKG9iamVjdCkgQGludGVyYWN0XG4gICAgICAgIFxcKi9cbiAgICAgICAgdW5zZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGV2ZW50cy5yZW1vdmUodGhpcy5fZWxlbWVudCwgJ2FsbCcpO1xuXG4gICAgICAgICAgICBpZiAoIWlzU3RyaW5nKHRoaXMuc2VsZWN0b3IpKSB7XG4gICAgICAgICAgICAgICAgZXZlbnRzLnJlbW92ZSh0aGlzLCAnYWxsJyk7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMub3B0aW9ucy5zdHlsZUN1cnNvcikge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9lbGVtZW50LnN0eWxlLmN1cnNvciA9ICcnO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIHJlbW92ZSBkZWxlZ2F0ZWQgZXZlbnRzXG4gICAgICAgICAgICAgICAgZm9yICh2YXIgdHlwZSBpbiBkZWxlZ2F0ZWRFdmVudHMpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGRlbGVnYXRlZCA9IGRlbGVnYXRlZEV2ZW50c1t0eXBlXTtcblxuICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGRlbGVnYXRlZC5zZWxlY3RvcnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkZWxlZ2F0ZWQuc2VsZWN0b3JzW2ldID09PSB0aGlzLnNlbGVjdG9yXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJiYgZGVsZWdhdGVkLmNvbnRleHRzW2ldID09PSB0aGlzLl9jb250ZXh0KSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWxlZ2F0ZWQuc2VsZWN0b3JzLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWxlZ2F0ZWQuY29udGV4dHMgLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWxlZ2F0ZWQubGlzdGVuZXJzLnNwbGljZShpLCAxKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHJlbW92ZSB0aGUgYXJyYXlzIGlmIHRoZXkgYXJlIGVtcHR5XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFkZWxlZ2F0ZWQuc2VsZWN0b3JzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWxlZ2F0ZWRFdmVudHNbdHlwZV0gPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnRzLnJlbW92ZSh0aGlzLl9jb250ZXh0LCB0eXBlLCBkZWxlZ2F0ZUxpc3RlbmVyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50cy5yZW1vdmUodGhpcy5fY29udGV4dCwgdHlwZSwgZGVsZWdhdGVVc2VDYXB0dXJlLCB0cnVlKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuZHJvcHpvbmUoZmFsc2UpO1xuXG4gICAgICAgICAgICBpbnRlcmFjdGFibGVzLnNwbGljZShpbmRleE9mKGludGVyYWN0YWJsZXMsIHRoaXMpLCAxKTtcblxuICAgICAgICAgICAgcmV0dXJuIGludGVyYWN0O1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIGZ1bmN0aW9uIHdhcm5PbmNlIChtZXRob2QsIG1lc3NhZ2UpIHtcbiAgICAgICAgdmFyIHdhcm5lZCA9IGZhbHNlO1xuXG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAoIXdhcm5lZCkge1xuICAgICAgICAgICAgICAgIHdpbmRvdy5jb25zb2xlLndhcm4obWVzc2FnZSk7XG4gICAgICAgICAgICAgICAgd2FybmVkID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIG1ldGhvZC5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIEludGVyYWN0YWJsZS5wcm90b3R5cGUuc25hcCA9IHdhcm5PbmNlKEludGVyYWN0YWJsZS5wcm90b3R5cGUuc25hcCxcbiAgICAgICAgICdJbnRlcmFjdGFibGUjc25hcCBpcyBkZXByZWNhdGVkLiBTZWUgdGhlIG5ldyBkb2N1bWVudGF0aW9uIGZvciBzbmFwcGluZyBhdCBodHRwOi8vaW50ZXJhY3Rqcy5pby9kb2NzL3NuYXBwaW5nJyk7XG4gICAgSW50ZXJhY3RhYmxlLnByb3RvdHlwZS5yZXN0cmljdCA9IHdhcm5PbmNlKEludGVyYWN0YWJsZS5wcm90b3R5cGUucmVzdHJpY3QsXG4gICAgICAgICAnSW50ZXJhY3RhYmxlI3Jlc3RyaWN0IGlzIGRlcHJlY2F0ZWQuIFNlZSB0aGUgbmV3IGRvY3VtZW50YXRpb24gZm9yIHJlc3RpY3RpbmcgYXQgaHR0cDovL2ludGVyYWN0anMuaW8vZG9jcy9yZXN0cmljdGlvbicpO1xuICAgIEludGVyYWN0YWJsZS5wcm90b3R5cGUuaW5lcnRpYSA9IHdhcm5PbmNlKEludGVyYWN0YWJsZS5wcm90b3R5cGUuaW5lcnRpYSxcbiAgICAgICAgICdJbnRlcmFjdGFibGUjaW5lcnRpYSBpcyBkZXByZWNhdGVkLiBTZWUgdGhlIG5ldyBkb2N1bWVudGF0aW9uIGZvciBpbmVydGlhIGF0IGh0dHA6Ly9pbnRlcmFjdGpzLmlvL2RvY3MvaW5lcnRpYScpO1xuICAgIEludGVyYWN0YWJsZS5wcm90b3R5cGUuYXV0b1Njcm9sbCA9IHdhcm5PbmNlKEludGVyYWN0YWJsZS5wcm90b3R5cGUuYXV0b1Njcm9sbCxcbiAgICAgICAgICdJbnRlcmFjdGFibGUjYXV0b1Njcm9sbCBpcyBkZXByZWNhdGVkLiBTZWUgdGhlIG5ldyBkb2N1bWVudGF0aW9uIGZvciBhdXRvU2Nyb2xsIGF0IGh0dHA6Ly9pbnRlcmFjdGpzLmlvL2RvY3MvI2F1dG9zY3JvbGwnKTtcbiAgICBJbnRlcmFjdGFibGUucHJvdG90eXBlLnNxdWFyZVJlc2l6ZSA9IHdhcm5PbmNlKEludGVyYWN0YWJsZS5wcm90b3R5cGUuc3F1YXJlUmVzaXplLFxuICAgICAgICAgJ0ludGVyYWN0YWJsZSNzcXVhcmVSZXNpemUgaXMgZGVwcmVjYXRlZC4gU2VlIGh0dHA6Ly9pbnRlcmFjdGpzLmlvL2RvY3MvI3Jlc2l6ZS1zcXVhcmUnKTtcblxuICAgIEludGVyYWN0YWJsZS5wcm90b3R5cGUuYWNjZXB0ID0gd2Fybk9uY2UoSW50ZXJhY3RhYmxlLnByb3RvdHlwZS5hY2NlcHQsXG4gICAgICAgICAnSW50ZXJhY3RhYmxlI2FjY2VwdCBpcyBkZXByZWNhdGVkLiB1c2UgSW50ZXJhY3RhYmxlI2Ryb3B6b25lKHsgYWNjZXB0OiB0YXJnZXQgfSkgaW5zdGVhZCcpO1xuICAgIEludGVyYWN0YWJsZS5wcm90b3R5cGUuZHJvcENoZWNrZXIgPSB3YXJuT25jZShJbnRlcmFjdGFibGUucHJvdG90eXBlLmRyb3BDaGVja2VyLFxuICAgICAgICAgJ0ludGVyYWN0YWJsZSNkcm9wQ2hlY2tlciBpcyBkZXByZWNhdGVkLiB1c2UgSW50ZXJhY3RhYmxlI2Ryb3B6b25lKHsgZHJvcENoZWNrZXI6IGNoZWNrZXJGdW5jdGlvbiB9KSBpbnN0ZWFkJyk7XG4gICAgSW50ZXJhY3RhYmxlLnByb3RvdHlwZS5jb250ZXh0ID0gd2Fybk9uY2UoSW50ZXJhY3RhYmxlLnByb3RvdHlwZS5jb250ZXh0LFxuICAgICAgICAgJ0ludGVyYWN0YWJsZSNjb250ZXh0IGFzIGEgbWV0aG9kIGlzIGRlcHJlY2F0ZWQuIEl0IHdpbGwgc29vbiBiZSBhIERPTSBOb2RlIGluc3RlYWQnKTtcblxuICAgIC8qXFxcbiAgICAgKiBpbnRlcmFjdC5pc1NldFxuICAgICBbIG1ldGhvZCBdXG4gICAgICpcbiAgICAgKiBDaGVjayBpZiBhbiBlbGVtZW50IGhhcyBiZWVuIHNldFxuICAgICAtIGVsZW1lbnQgKEVsZW1lbnQpIFRoZSBFbGVtZW50IGJlaW5nIHNlYXJjaGVkIGZvclxuICAgICA9IChib29sZWFuKSBJbmRpY2F0ZXMgaWYgdGhlIGVsZW1lbnQgb3IgQ1NTIHNlbGVjdG9yIHdhcyBwcmV2aW91c2x5IHBhc3NlZCB0byBpbnRlcmFjdFxuICAgIFxcKi9cbiAgICBpbnRlcmFjdC5pc1NldCA9IGZ1bmN0aW9uKGVsZW1lbnQsIG9wdGlvbnMpIHtcbiAgICAgICAgcmV0dXJuIGludGVyYWN0YWJsZXMuaW5kZXhPZkVsZW1lbnQoZWxlbWVudCwgb3B0aW9ucyAmJiBvcHRpb25zLmNvbnRleHQpICE9PSAtMTtcbiAgICB9O1xuXG4gICAgLypcXFxuICAgICAqIGludGVyYWN0Lm9uXG4gICAgIFsgbWV0aG9kIF1cbiAgICAgKlxuICAgICAqIEFkZHMgYSBnbG9iYWwgbGlzdGVuZXIgZm9yIGFuIEludGVyYWN0RXZlbnQgb3IgYWRkcyBhIERPTSBldmVudCB0b1xuICAgICAqIGBkb2N1bWVudGBcbiAgICAgKlxuICAgICAtIHR5cGUgICAgICAgKHN0cmluZyB8IGFycmF5IHwgb2JqZWN0KSBUaGUgdHlwZXMgb2YgZXZlbnRzIHRvIGxpc3RlbiBmb3JcbiAgICAgLSBsaXN0ZW5lciAgIChmdW5jdGlvbikgVGhlIGZ1bmN0aW9uIHRvIGJlIGNhbGxlZCBvbiB0aGUgZ2l2ZW4gZXZlbnQocylcbiAgICAgLSB1c2VDYXB0dXJlIChib29sZWFuKSAjb3B0aW9uYWwgdXNlQ2FwdHVyZSBmbGFnIGZvciBhZGRFdmVudExpc3RlbmVyXG4gICAgID0gKG9iamVjdCkgaW50ZXJhY3RcbiAgICBcXCovXG4gICAgaW50ZXJhY3Qub24gPSBmdW5jdGlvbiAodHlwZSwgbGlzdGVuZXIsIHVzZUNhcHR1cmUpIHtcbiAgICAgICAgaWYgKGlzU3RyaW5nKHR5cGUpICYmIHR5cGUuc2VhcmNoKCcgJykgIT09IC0xKSB7XG4gICAgICAgICAgICB0eXBlID0gdHlwZS50cmltKCkuc3BsaXQoLyArLyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaXNBcnJheSh0eXBlKSkge1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0eXBlLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaW50ZXJhY3Qub24odHlwZVtpXSwgbGlzdGVuZXIsIHVzZUNhcHR1cmUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gaW50ZXJhY3Q7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaXNPYmplY3QodHlwZSkpIHtcbiAgICAgICAgICAgIGZvciAodmFyIHByb3AgaW4gdHlwZSkge1xuICAgICAgICAgICAgICAgIGludGVyYWN0Lm9uKHByb3AsIHR5cGVbcHJvcF0sIGxpc3RlbmVyKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGludGVyYWN0O1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gaWYgaXQgaXMgYW4gSW50ZXJhY3RFdmVudCB0eXBlLCBhZGQgbGlzdGVuZXIgdG8gZ2xvYmFsRXZlbnRzXG4gICAgICAgIGlmIChjb250YWlucyhldmVudFR5cGVzLCB0eXBlKSkge1xuICAgICAgICAgICAgLy8gaWYgdGhpcyB0eXBlIG9mIGV2ZW50IHdhcyBuZXZlciBib3VuZFxuICAgICAgICAgICAgaWYgKCFnbG9iYWxFdmVudHNbdHlwZV0pIHtcbiAgICAgICAgICAgICAgICBnbG9iYWxFdmVudHNbdHlwZV0gPSBbbGlzdGVuZXJdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgZ2xvYmFsRXZlbnRzW3R5cGVdLnB1c2gobGlzdGVuZXIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIElmIG5vbiBJbnRlcmFjdEV2ZW50IHR5cGUsIGFkZEV2ZW50TGlzdGVuZXIgdG8gZG9jdW1lbnRcbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBldmVudHMuYWRkKGRvY3VtZW50LCB0eXBlLCBsaXN0ZW5lciwgdXNlQ2FwdHVyZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gaW50ZXJhY3Q7XG4gICAgfTtcblxuICAgIC8qXFxcbiAgICAgKiBpbnRlcmFjdC5vZmZcbiAgICAgWyBtZXRob2QgXVxuICAgICAqXG4gICAgICogUmVtb3ZlcyBhIGdsb2JhbCBJbnRlcmFjdEV2ZW50IGxpc3RlbmVyIG9yIERPTSBldmVudCBmcm9tIGBkb2N1bWVudGBcbiAgICAgKlxuICAgICAtIHR5cGUgICAgICAgKHN0cmluZyB8IGFycmF5IHwgb2JqZWN0KSBUaGUgdHlwZXMgb2YgZXZlbnRzIHRoYXQgd2VyZSBsaXN0ZW5lZCBmb3JcbiAgICAgLSBsaXN0ZW5lciAgIChmdW5jdGlvbikgVGhlIGxpc3RlbmVyIGZ1bmN0aW9uIHRvIGJlIHJlbW92ZWRcbiAgICAgLSB1c2VDYXB0dXJlIChib29sZWFuKSAjb3B0aW9uYWwgdXNlQ2FwdHVyZSBmbGFnIGZvciByZW1vdmVFdmVudExpc3RlbmVyXG4gICAgID0gKG9iamVjdCkgaW50ZXJhY3RcbiAgICAgXFwqL1xuICAgIGludGVyYWN0Lm9mZiA9IGZ1bmN0aW9uICh0eXBlLCBsaXN0ZW5lciwgdXNlQ2FwdHVyZSkge1xuICAgICAgICBpZiAoaXNTdHJpbmcodHlwZSkgJiYgdHlwZS5zZWFyY2goJyAnKSAhPT0gLTEpIHtcbiAgICAgICAgICAgIHR5cGUgPSB0eXBlLnRyaW0oKS5zcGxpdCgvICsvKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChpc0FycmF5KHR5cGUpKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHR5cGUubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBpbnRlcmFjdC5vZmYodHlwZVtpXSwgbGlzdGVuZXIsIHVzZUNhcHR1cmUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gaW50ZXJhY3Q7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaXNPYmplY3QodHlwZSkpIHtcbiAgICAgICAgICAgIGZvciAodmFyIHByb3AgaW4gdHlwZSkge1xuICAgICAgICAgICAgICAgIGludGVyYWN0Lm9mZihwcm9wLCB0eXBlW3Byb3BdLCBsaXN0ZW5lcik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBpbnRlcmFjdDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghY29udGFpbnMoZXZlbnRUeXBlcywgdHlwZSkpIHtcbiAgICAgICAgICAgIGV2ZW50cy5yZW1vdmUoZG9jdW1lbnQsIHR5cGUsIGxpc3RlbmVyLCB1c2VDYXB0dXJlKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBpbmRleDtcblxuICAgICAgICAgICAgaWYgKHR5cGUgaW4gZ2xvYmFsRXZlbnRzXG4gICAgICAgICAgICAgICAgJiYgKGluZGV4ID0gaW5kZXhPZihnbG9iYWxFdmVudHNbdHlwZV0sIGxpc3RlbmVyKSkgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgZ2xvYmFsRXZlbnRzW3R5cGVdLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gaW50ZXJhY3Q7XG4gICAgfTtcblxuICAgIC8qXFxcbiAgICAgKiBpbnRlcmFjdC5lbmFibGVEcmFnZ2luZ1xuICAgICBbIG1ldGhvZCBdXG4gICAgICpcbiAgICAgKiBEZXByZWNhdGVkLlxuICAgICAqXG4gICAgICogUmV0dXJucyBvciBzZXRzIHdoZXRoZXIgZHJhZ2dpbmcgaXMgZW5hYmxlZCBmb3IgYW55IEludGVyYWN0YWJsZXNcbiAgICAgKlxuICAgICAtIG5ld1ZhbHVlIChib29sZWFuKSAjb3B0aW9uYWwgYHRydWVgIHRvIGFsbG93IHRoZSBhY3Rpb247IGBmYWxzZWAgdG8gZGlzYWJsZSBhY3Rpb24gZm9yIGFsbCBJbnRlcmFjdGFibGVzXG4gICAgID0gKGJvb2xlYW4gfCBvYmplY3QpIFRoZSBjdXJyZW50IHNldHRpbmcgb3IgaW50ZXJhY3RcbiAgICBcXCovXG4gICAgaW50ZXJhY3QuZW5hYmxlRHJhZ2dpbmcgPSB3YXJuT25jZShmdW5jdGlvbiAobmV3VmFsdWUpIHtcbiAgICAgICAgaWYgKG5ld1ZhbHVlICE9PSBudWxsICYmIG5ld1ZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGFjdGlvbklzRW5hYmxlZC5kcmFnID0gbmV3VmFsdWU7XG5cbiAgICAgICAgICAgIHJldHVybiBpbnRlcmFjdDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYWN0aW9uSXNFbmFibGVkLmRyYWc7XG4gICAgfSwgJ2ludGVyYWN0LmVuYWJsZURyYWdnaW5nIGlzIGRlcHJlY2F0ZWQgYW5kIHdpbGwgc29vbiBiZSByZW1vdmVkLicpO1xuXG4gICAgLypcXFxuICAgICAqIGludGVyYWN0LmVuYWJsZVJlc2l6aW5nXG4gICAgIFsgbWV0aG9kIF1cbiAgICAgKlxuICAgICAqIERlcHJlY2F0ZWQuXG4gICAgICpcbiAgICAgKiBSZXR1cm5zIG9yIHNldHMgd2hldGhlciByZXNpemluZyBpcyBlbmFibGVkIGZvciBhbnkgSW50ZXJhY3RhYmxlc1xuICAgICAqXG4gICAgIC0gbmV3VmFsdWUgKGJvb2xlYW4pICNvcHRpb25hbCBgdHJ1ZWAgdG8gYWxsb3cgdGhlIGFjdGlvbjsgYGZhbHNlYCB0byBkaXNhYmxlIGFjdGlvbiBmb3IgYWxsIEludGVyYWN0YWJsZXNcbiAgICAgPSAoYm9vbGVhbiB8IG9iamVjdCkgVGhlIGN1cnJlbnQgc2V0dGluZyBvciBpbnRlcmFjdFxuICAgIFxcKi9cbiAgICBpbnRlcmFjdC5lbmFibGVSZXNpemluZyA9IHdhcm5PbmNlKGZ1bmN0aW9uIChuZXdWYWx1ZSkge1xuICAgICAgICBpZiAobmV3VmFsdWUgIT09IG51bGwgJiYgbmV3VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgYWN0aW9uSXNFbmFibGVkLnJlc2l6ZSA9IG5ld1ZhbHVlO1xuXG4gICAgICAgICAgICByZXR1cm4gaW50ZXJhY3Q7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGFjdGlvbklzRW5hYmxlZC5yZXNpemU7XG4gICAgfSwgJ2ludGVyYWN0LmVuYWJsZVJlc2l6aW5nIGlzIGRlcHJlY2F0ZWQgYW5kIHdpbGwgc29vbiBiZSByZW1vdmVkLicpO1xuXG4gICAgLypcXFxuICAgICAqIGludGVyYWN0LmVuYWJsZUdlc3R1cmluZ1xuICAgICBbIG1ldGhvZCBdXG4gICAgICpcbiAgICAgKiBEZXByZWNhdGVkLlxuICAgICAqXG4gICAgICogUmV0dXJucyBvciBzZXRzIHdoZXRoZXIgZ2VzdHVyaW5nIGlzIGVuYWJsZWQgZm9yIGFueSBJbnRlcmFjdGFibGVzXG4gICAgICpcbiAgICAgLSBuZXdWYWx1ZSAoYm9vbGVhbikgI29wdGlvbmFsIGB0cnVlYCB0byBhbGxvdyB0aGUgYWN0aW9uOyBgZmFsc2VgIHRvIGRpc2FibGUgYWN0aW9uIGZvciBhbGwgSW50ZXJhY3RhYmxlc1xuICAgICA9IChib29sZWFuIHwgb2JqZWN0KSBUaGUgY3VycmVudCBzZXR0aW5nIG9yIGludGVyYWN0XG4gICAgXFwqL1xuICAgIGludGVyYWN0LmVuYWJsZUdlc3R1cmluZyA9IHdhcm5PbmNlKGZ1bmN0aW9uIChuZXdWYWx1ZSkge1xuICAgICAgICBpZiAobmV3VmFsdWUgIT09IG51bGwgJiYgbmV3VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgYWN0aW9uSXNFbmFibGVkLmdlc3R1cmUgPSBuZXdWYWx1ZTtcblxuICAgICAgICAgICAgcmV0dXJuIGludGVyYWN0O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBhY3Rpb25Jc0VuYWJsZWQuZ2VzdHVyZTtcbiAgICB9LCAnaW50ZXJhY3QuZW5hYmxlR2VzdHVyaW5nIGlzIGRlcHJlY2F0ZWQgYW5kIHdpbGwgc29vbiBiZSByZW1vdmVkLicpO1xuXG4gICAgaW50ZXJhY3QuZXZlbnRUeXBlcyA9IGV2ZW50VHlwZXM7XG5cbiAgICAvKlxcXG4gICAgICogaW50ZXJhY3QuZGVidWdcbiAgICAgWyBtZXRob2QgXVxuICAgICAqXG4gICAgICogUmV0dXJucyBkZWJ1Z2dpbmcgZGF0YVxuICAgICA9IChvYmplY3QpIEFuIG9iamVjdCB3aXRoIHByb3BlcnRpZXMgdGhhdCBvdXRsaW5lIHRoZSBjdXJyZW50IHN0YXRlIGFuZCBleHBvc2UgaW50ZXJuYWwgZnVuY3Rpb25zIGFuZCB2YXJpYWJsZXNcbiAgICBcXCovXG4gICAgaW50ZXJhY3QuZGVidWcgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBpbnRlcmFjdGlvbiA9IGludGVyYWN0aW9uc1swXSB8fCBuZXcgSW50ZXJhY3Rpb24oKTtcblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgaW50ZXJhY3Rpb25zICAgICAgICAgIDogaW50ZXJhY3Rpb25zLFxuICAgICAgICAgICAgdGFyZ2V0ICAgICAgICAgICAgICAgIDogaW50ZXJhY3Rpb24udGFyZ2V0LFxuICAgICAgICAgICAgZHJhZ2dpbmcgICAgICAgICAgICAgIDogaW50ZXJhY3Rpb24uZHJhZ2dpbmcsXG4gICAgICAgICAgICByZXNpemluZyAgICAgICAgICAgICAgOiBpbnRlcmFjdGlvbi5yZXNpemluZyxcbiAgICAgICAgICAgIGdlc3R1cmluZyAgICAgICAgICAgICA6IGludGVyYWN0aW9uLmdlc3R1cmluZyxcbiAgICAgICAgICAgIHByZXBhcmVkICAgICAgICAgICAgICA6IGludGVyYWN0aW9uLnByZXBhcmVkLFxuICAgICAgICAgICAgbWF0Y2hlcyAgICAgICAgICAgICAgIDogaW50ZXJhY3Rpb24ubWF0Y2hlcyxcbiAgICAgICAgICAgIG1hdGNoRWxlbWVudHMgICAgICAgICA6IGludGVyYWN0aW9uLm1hdGNoRWxlbWVudHMsXG5cbiAgICAgICAgICAgIHByZXZDb29yZHMgICAgICAgICAgICA6IGludGVyYWN0aW9uLnByZXZDb29yZHMsXG4gICAgICAgICAgICBzdGFydENvb3JkcyAgICAgICAgICAgOiBpbnRlcmFjdGlvbi5zdGFydENvb3JkcyxcblxuICAgICAgICAgICAgcG9pbnRlcklkcyAgICAgICAgICAgIDogaW50ZXJhY3Rpb24ucG9pbnRlcklkcyxcbiAgICAgICAgICAgIHBvaW50ZXJzICAgICAgICAgICAgICA6IGludGVyYWN0aW9uLnBvaW50ZXJzLFxuICAgICAgICAgICAgYWRkUG9pbnRlciAgICAgICAgICAgIDogbGlzdGVuZXJzLmFkZFBvaW50ZXIsXG4gICAgICAgICAgICByZW1vdmVQb2ludGVyICAgICAgICAgOiBsaXN0ZW5lcnMucmVtb3ZlUG9pbnRlcixcbiAgICAgICAgICAgIHJlY29yZFBvaW50ZXIgICAgICAgIDogbGlzdGVuZXJzLnJlY29yZFBvaW50ZXIsXG5cbiAgICAgICAgICAgIHNuYXAgICAgICAgICAgICAgICAgICA6IGludGVyYWN0aW9uLnNuYXBTdGF0dXMsXG4gICAgICAgICAgICByZXN0cmljdCAgICAgICAgICAgICAgOiBpbnRlcmFjdGlvbi5yZXN0cmljdFN0YXR1cyxcbiAgICAgICAgICAgIGluZXJ0aWEgICAgICAgICAgICAgICA6IGludGVyYWN0aW9uLmluZXJ0aWFTdGF0dXMsXG5cbiAgICAgICAgICAgIGRvd25UaW1lICAgICAgICAgICAgICA6IGludGVyYWN0aW9uLmRvd25UaW1lc1swXSxcbiAgICAgICAgICAgIGRvd25FdmVudCAgICAgICAgICAgICA6IGludGVyYWN0aW9uLmRvd25FdmVudCxcbiAgICAgICAgICAgIGRvd25Qb2ludGVyICAgICAgICAgICA6IGludGVyYWN0aW9uLmRvd25Qb2ludGVyLFxuICAgICAgICAgICAgcHJldkV2ZW50ICAgICAgICAgICAgIDogaW50ZXJhY3Rpb24ucHJldkV2ZW50LFxuXG4gICAgICAgICAgICBJbnRlcmFjdGFibGUgICAgICAgICAgOiBJbnRlcmFjdGFibGUsXG4gICAgICAgICAgICBpbnRlcmFjdGFibGVzICAgICAgICAgOiBpbnRlcmFjdGFibGVzLFxuICAgICAgICAgICAgcG9pbnRlcklzRG93biAgICAgICAgIDogaW50ZXJhY3Rpb24ucG9pbnRlcklzRG93bixcbiAgICAgICAgICAgIGRlZmF1bHRPcHRpb25zICAgICAgICA6IGRlZmF1bHRPcHRpb25zLFxuICAgICAgICAgICAgZGVmYXVsdEFjdGlvbkNoZWNrZXIgIDogZGVmYXVsdEFjdGlvbkNoZWNrZXIsXG5cbiAgICAgICAgICAgIGFjdGlvbkN1cnNvcnMgICAgICAgICA6IGFjdGlvbkN1cnNvcnMsXG4gICAgICAgICAgICBkcmFnTW92ZSAgICAgICAgICAgICAgOiBsaXN0ZW5lcnMuZHJhZ01vdmUsXG4gICAgICAgICAgICByZXNpemVNb3ZlICAgICAgICAgICAgOiBsaXN0ZW5lcnMucmVzaXplTW92ZSxcbiAgICAgICAgICAgIGdlc3R1cmVNb3ZlICAgICAgICAgICA6IGxpc3RlbmVycy5nZXN0dXJlTW92ZSxcbiAgICAgICAgICAgIHBvaW50ZXJVcCAgICAgICAgICAgICA6IGxpc3RlbmVycy5wb2ludGVyVXAsXG4gICAgICAgICAgICBwb2ludGVyRG93biAgICAgICAgICAgOiBsaXN0ZW5lcnMucG9pbnRlckRvd24sXG4gICAgICAgICAgICBwb2ludGVyTW92ZSAgICAgICAgICAgOiBsaXN0ZW5lcnMucG9pbnRlck1vdmUsXG4gICAgICAgICAgICBwb2ludGVySG92ZXIgICAgICAgICAgOiBsaXN0ZW5lcnMucG9pbnRlckhvdmVyLFxuXG4gICAgICAgICAgICBldmVudFR5cGVzICAgICAgICAgICAgOiBldmVudFR5cGVzLFxuXG4gICAgICAgICAgICBldmVudHMgICAgICAgICAgICAgICAgOiBldmVudHMsXG4gICAgICAgICAgICBnbG9iYWxFdmVudHMgICAgICAgICAgOiBnbG9iYWxFdmVudHMsXG4gICAgICAgICAgICBkZWxlZ2F0ZWRFdmVudHMgICAgICAgOiBkZWxlZ2F0ZWRFdmVudHMsXG5cbiAgICAgICAgICAgIHByZWZpeGVkUHJvcFJFcyAgICAgICA6IHByZWZpeGVkUHJvcFJFc1xuICAgICAgICB9O1xuICAgIH07XG5cbiAgICAvLyBleHBvc2UgdGhlIGZ1bmN0aW9ucyB1c2VkIHRvIGNhbGN1bGF0ZSBtdWx0aS10b3VjaCBwcm9wZXJ0aWVzXG4gICAgaW50ZXJhY3QuZ2V0UG9pbnRlckF2ZXJhZ2UgPSBwb2ludGVyQXZlcmFnZTtcbiAgICBpbnRlcmFjdC5nZXRUb3VjaEJCb3ggICAgID0gdG91Y2hCQm94O1xuICAgIGludGVyYWN0LmdldFRvdWNoRGlzdGFuY2UgPSB0b3VjaERpc3RhbmNlO1xuICAgIGludGVyYWN0LmdldFRvdWNoQW5nbGUgICAgPSB0b3VjaEFuZ2xlO1xuXG4gICAgaW50ZXJhY3QuZ2V0RWxlbWVudFJlY3QgICAgICAgICA9IGdldEVsZW1lbnRSZWN0O1xuICAgIGludGVyYWN0LmdldEVsZW1lbnRDbGllbnRSZWN0ICAgPSBnZXRFbGVtZW50Q2xpZW50UmVjdDtcbiAgICBpbnRlcmFjdC5tYXRjaGVzU2VsZWN0b3IgICAgICAgID0gbWF0Y2hlc1NlbGVjdG9yO1xuICAgIGludGVyYWN0LmNsb3Nlc3QgICAgICAgICAgICAgICAgPSBjbG9zZXN0O1xuXG4gICAgLypcXFxuICAgICAqIGludGVyYWN0Lm1hcmdpblxuICAgICBbIG1ldGhvZCBdXG4gICAgICpcbiAgICAgKiBEZXByZWNhdGVkLiBVc2UgYGludGVyYWN0KHRhcmdldCkucmVzaXphYmxlKHsgbWFyZ2luOiBudW1iZXIgfSk7YCBpbnN0ZWFkLlxuICAgICAqIFJldHVybnMgb3Igc2V0cyB0aGUgbWFyZ2luIGZvciBhdXRvY2hlY2sgcmVzaXppbmcgdXNlZCBpblxuICAgICAqIEBJbnRlcmFjdGFibGUuZ2V0QWN0aW9uLiBUaGF0IGlzIHRoZSBkaXN0YW5jZSBmcm9tIHRoZSBib3R0b20gYW5kIHJpZ2h0XG4gICAgICogZWRnZXMgb2YgYW4gZWxlbWVudCBjbGlja2luZyBpbiB3aGljaCB3aWxsIHN0YXJ0IHJlc2l6aW5nXG4gICAgICpcbiAgICAgLSBuZXdWYWx1ZSAobnVtYmVyKSAjb3B0aW9uYWxcbiAgICAgPSAobnVtYmVyIHwgaW50ZXJhY3QpIFRoZSBjdXJyZW50IG1hcmdpbiB2YWx1ZSBvciBpbnRlcmFjdFxuICAgIFxcKi9cbiAgICBpbnRlcmFjdC5tYXJnaW4gPSB3YXJuT25jZShmdW5jdGlvbiAobmV3dmFsdWUpIHtcbiAgICAgICAgaWYgKGlzTnVtYmVyKG5ld3ZhbHVlKSkge1xuICAgICAgICAgICAgbWFyZ2luID0gbmV3dmFsdWU7XG5cbiAgICAgICAgICAgIHJldHVybiBpbnRlcmFjdDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWFyZ2luO1xuICAgIH0sXG4gICAgJ2ludGVyYWN0Lm1hcmdpbiBpcyBkZXByZWNhdGVkLiBVc2UgaW50ZXJhY3QodGFyZ2V0KS5yZXNpemFibGUoeyBtYXJnaW46IG51bWJlciB9KTsgaW5zdGVhZC4nKSA7XG5cbiAgICAvKlxcXG4gICAgICogaW50ZXJhY3Quc3VwcG9ydHNUb3VjaFxuICAgICBbIG1ldGhvZCBdXG4gICAgICpcbiAgICAgPSAoYm9vbGVhbikgV2hldGhlciBvciBub3QgdGhlIGJyb3dzZXIgc3VwcG9ydHMgdG91Y2ggaW5wdXRcbiAgICBcXCovXG4gICAgaW50ZXJhY3Quc3VwcG9ydHNUb3VjaCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHN1cHBvcnRzVG91Y2g7XG4gICAgfTtcblxuICAgIC8qXFxcbiAgICAgKiBpbnRlcmFjdC5zdXBwb3J0c1BvaW50ZXJFdmVudFxuICAgICBbIG1ldGhvZCBdXG4gICAgICpcbiAgICAgPSAoYm9vbGVhbikgV2hldGhlciBvciBub3QgdGhlIGJyb3dzZXIgc3VwcG9ydHMgUG9pbnRlckV2ZW50c1xuICAgIFxcKi9cbiAgICBpbnRlcmFjdC5zdXBwb3J0c1BvaW50ZXJFdmVudCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHN1cHBvcnRzUG9pbnRlckV2ZW50O1xuICAgIH07XG5cbiAgICAvKlxcXG4gICAgICogaW50ZXJhY3Quc3RvcFxuICAgICBbIG1ldGhvZCBdXG4gICAgICpcbiAgICAgKiBDYW5jZWxzIGFsbCBpbnRlcmFjdGlvbnMgKGVuZCBldmVudHMgYXJlIG5vdCBmaXJlZClcbiAgICAgKlxuICAgICAtIGV2ZW50IChFdmVudCkgQW4gZXZlbnQgb24gd2hpY2ggdG8gY2FsbCBwcmV2ZW50RGVmYXVsdCgpXG4gICAgID0gKG9iamVjdCkgaW50ZXJhY3RcbiAgICBcXCovXG4gICAgaW50ZXJhY3Quc3RvcCA9IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICBmb3IgKHZhciBpID0gaW50ZXJhY3Rpb25zLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICAgICBpbnRlcmFjdGlvbnNbaV0uc3RvcChldmVudCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gaW50ZXJhY3Q7XG4gICAgfTtcblxuICAgIC8qXFxcbiAgICAgKiBpbnRlcmFjdC5keW5hbWljRHJvcFxuICAgICBbIG1ldGhvZCBdXG4gICAgICpcbiAgICAgKiBSZXR1cm5zIG9yIHNldHMgd2hldGhlciB0aGUgZGltZW5zaW9ucyBvZiBkcm9wem9uZSBlbGVtZW50cyBhcmVcbiAgICAgKiBjYWxjdWxhdGVkIG9uIGV2ZXJ5IGRyYWdtb3ZlIG9yIG9ubHkgb24gZHJhZ3N0YXJ0IGZvciB0aGUgZGVmYXVsdFxuICAgICAqIGRyb3BDaGVja2VyXG4gICAgICpcbiAgICAgLSBuZXdWYWx1ZSAoYm9vbGVhbikgI29wdGlvbmFsIFRydWUgdG8gY2hlY2sgb24gZWFjaCBtb3ZlLiBGYWxzZSB0byBjaGVjayBvbmx5IGJlZm9yZSBzdGFydFxuICAgICA9IChib29sZWFuIHwgaW50ZXJhY3QpIFRoZSBjdXJyZW50IHNldHRpbmcgb3IgaW50ZXJhY3RcbiAgICBcXCovXG4gICAgaW50ZXJhY3QuZHluYW1pY0Ryb3AgPSBmdW5jdGlvbiAobmV3VmFsdWUpIHtcbiAgICAgICAgaWYgKGlzQm9vbChuZXdWYWx1ZSkpIHtcbiAgICAgICAgICAgIC8vaWYgKGRyYWdnaW5nICYmIGR5bmFtaWNEcm9wICE9PSBuZXdWYWx1ZSAmJiAhbmV3VmFsdWUpIHtcbiAgICAgICAgICAgICAgICAvL2NhbGNSZWN0cyhkcm9wem9uZXMpO1xuICAgICAgICAgICAgLy99XG5cbiAgICAgICAgICAgIGR5bmFtaWNEcm9wID0gbmV3VmFsdWU7XG5cbiAgICAgICAgICAgIHJldHVybiBpbnRlcmFjdDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZHluYW1pY0Ryb3A7XG4gICAgfTtcblxuICAgIC8qXFxcbiAgICAgKiBpbnRlcmFjdC5wb2ludGVyTW92ZVRvbGVyYW5jZVxuICAgICBbIG1ldGhvZCBdXG4gICAgICogUmV0dXJucyBvciBzZXRzIHRoZSBkaXN0YW5jZSB0aGUgcG9pbnRlciBtdXN0IGJlIG1vdmVkIGJlZm9yZSBhbiBhY3Rpb25cbiAgICAgKiBzZXF1ZW5jZSBvY2N1cnMuIFRoaXMgYWxzbyBhZmZlY3RzIHRvbGVyYW5jZSBmb3IgdGFwIGV2ZW50cy5cbiAgICAgKlxuICAgICAtIG5ld1ZhbHVlIChudW1iZXIpICNvcHRpb25hbCBUaGUgbW92ZW1lbnQgZnJvbSB0aGUgc3RhcnQgcG9zaXRpb24gbXVzdCBiZSBncmVhdGVyIHRoYW4gdGhpcyB2YWx1ZVxuICAgICA9IChudW1iZXIgfCBJbnRlcmFjdGFibGUpIFRoZSBjdXJyZW50IHNldHRpbmcgb3IgaW50ZXJhY3RcbiAgICBcXCovXG4gICAgaW50ZXJhY3QucG9pbnRlck1vdmVUb2xlcmFuY2UgPSBmdW5jdGlvbiAobmV3VmFsdWUpIHtcbiAgICAgICAgaWYgKGlzTnVtYmVyKG5ld1ZhbHVlKSkge1xuICAgICAgICAgICAgcG9pbnRlck1vdmVUb2xlcmFuY2UgPSBuZXdWYWx1ZTtcblxuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcG9pbnRlck1vdmVUb2xlcmFuY2U7XG4gICAgfTtcblxuICAgIC8qXFxcbiAgICAgKiBpbnRlcmFjdC5tYXhJbnRlcmFjdGlvbnNcbiAgICAgWyBtZXRob2QgXVxuICAgICAqKlxuICAgICAqIFJldHVybnMgb3Igc2V0cyB0aGUgbWF4aW11bSBudW1iZXIgb2YgY29uY3VycmVudCBpbnRlcmFjdGlvbnMgYWxsb3dlZC5cbiAgICAgKiBCeSBkZWZhdWx0IG9ubHkgMSBpbnRlcmFjdGlvbiBpcyBhbGxvd2VkIGF0IGEgdGltZSAoZm9yIGJhY2t3YXJkc1xuICAgICAqIGNvbXBhdGliaWxpdHkpLiBUbyBhbGxvdyBtdWx0aXBsZSBpbnRlcmFjdGlvbnMgb24gdGhlIHNhbWUgSW50ZXJhY3RhYmxlc1xuICAgICAqIGFuZCBlbGVtZW50cywgeW91IG5lZWQgdG8gZW5hYmxlIGl0IGluIHRoZSBkcmFnZ2FibGUsIHJlc2l6YWJsZSBhbmRcbiAgICAgKiBnZXN0dXJhYmxlIGAnbWF4J2AgYW5kIGAnbWF4UGVyRWxlbWVudCdgIG9wdGlvbnMuXG4gICAgICoqXG4gICAgIC0gbmV3VmFsdWUgKG51bWJlcikgI29wdGlvbmFsIEFueSBudW1iZXIuIG5ld1ZhbHVlIDw9IDAgbWVhbnMgbm8gaW50ZXJhY3Rpb25zLlxuICAgIFxcKi9cbiAgICBpbnRlcmFjdC5tYXhJbnRlcmFjdGlvbnMgPSBmdW5jdGlvbiAobmV3VmFsdWUpIHtcbiAgICAgICAgaWYgKGlzTnVtYmVyKG5ld1ZhbHVlKSkge1xuICAgICAgICAgICAgbWF4SW50ZXJhY3Rpb25zID0gbmV3VmFsdWU7XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG1heEludGVyYWN0aW9ucztcbiAgICB9O1xuXG4gICAgaW50ZXJhY3QuY3JlYXRlU25hcEdyaWQgPSBmdW5jdGlvbiAoZ3JpZCkge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKHgsIHkpIHtcbiAgICAgICAgICAgIHZhciBvZmZzZXRYID0gMCxcbiAgICAgICAgICAgICAgICBvZmZzZXRZID0gMDtcblxuICAgICAgICAgICAgaWYgKGlzT2JqZWN0KGdyaWQub2Zmc2V0KSkge1xuICAgICAgICAgICAgICAgIG9mZnNldFggPSBncmlkLm9mZnNldC54O1xuICAgICAgICAgICAgICAgIG9mZnNldFkgPSBncmlkLm9mZnNldC55O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgZ3JpZHggPSBNYXRoLnJvdW5kKCh4IC0gb2Zmc2V0WCkgLyBncmlkLngpLFxuICAgICAgICAgICAgICAgIGdyaWR5ID0gTWF0aC5yb3VuZCgoeSAtIG9mZnNldFkpIC8gZ3JpZC55KSxcblxuICAgICAgICAgICAgICAgIG5ld1ggPSBncmlkeCAqIGdyaWQueCArIG9mZnNldFgsXG4gICAgICAgICAgICAgICAgbmV3WSA9IGdyaWR5ICogZ3JpZC55ICsgb2Zmc2V0WTtcblxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB4OiBuZXdYLFxuICAgICAgICAgICAgICAgIHk6IG5ld1ksXG4gICAgICAgICAgICAgICAgcmFuZ2U6IGdyaWQucmFuZ2VcbiAgICAgICAgICAgIH07XG4gICAgICAgIH07XG4gICAgfTtcblxuICAgIGZ1bmN0aW9uIGVuZEFsbEludGVyYWN0aW9ucyAoZXZlbnQpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBpbnRlcmFjdGlvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGludGVyYWN0aW9uc1tpXS5wb2ludGVyRW5kKGV2ZW50LCBldmVudCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaXN0ZW5Ub0RvY3VtZW50IChkb2MpIHtcbiAgICAgICAgaWYgKGNvbnRhaW5zKGRvY3VtZW50cywgZG9jKSkgeyByZXR1cm47IH1cblxuICAgICAgICB2YXIgd2luID0gZG9jLmRlZmF1bHRWaWV3IHx8IGRvYy5wYXJlbnRXaW5kb3c7XG5cbiAgICAgICAgLy8gYWRkIGRlbGVnYXRlIGV2ZW50IGxpc3RlbmVyXG4gICAgICAgIGZvciAodmFyIGV2ZW50VHlwZSBpbiBkZWxlZ2F0ZWRFdmVudHMpIHtcbiAgICAgICAgICAgIGV2ZW50cy5hZGQoZG9jLCBldmVudFR5cGUsIGRlbGVnYXRlTGlzdGVuZXIpO1xuICAgICAgICAgICAgZXZlbnRzLmFkZChkb2MsIGV2ZW50VHlwZSwgZGVsZWdhdGVVc2VDYXB0dXJlLCB0cnVlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChQb2ludGVyRXZlbnQpIHtcbiAgICAgICAgICAgIGlmIChQb2ludGVyRXZlbnQgPT09IHdpbi5NU1BvaW50ZXJFdmVudCkge1xuICAgICAgICAgICAgICAgIHBFdmVudFR5cGVzID0ge1xuICAgICAgICAgICAgICAgICAgICB1cDogJ01TUG9pbnRlclVwJywgZG93bjogJ01TUG9pbnRlckRvd24nLCBvdmVyOiAnbW91c2VvdmVyJyxcbiAgICAgICAgICAgICAgICAgICAgb3V0OiAnbW91c2VvdXQnLCBtb3ZlOiAnTVNQb2ludGVyTW92ZScsIGNhbmNlbDogJ01TUG9pbnRlckNhbmNlbCcgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHBFdmVudFR5cGVzID0ge1xuICAgICAgICAgICAgICAgICAgICB1cDogJ3BvaW50ZXJ1cCcsIGRvd246ICdwb2ludGVyZG93bicsIG92ZXI6ICdwb2ludGVyb3ZlcicsXG4gICAgICAgICAgICAgICAgICAgIG91dDogJ3BvaW50ZXJvdXQnLCBtb3ZlOiAncG9pbnRlcm1vdmUnLCBjYW5jZWw6ICdwb2ludGVyY2FuY2VsJyB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBldmVudHMuYWRkKGRvYywgcEV2ZW50VHlwZXMuZG93biAgLCBsaXN0ZW5lcnMuc2VsZWN0b3JEb3duICk7XG4gICAgICAgICAgICBldmVudHMuYWRkKGRvYywgcEV2ZW50VHlwZXMubW92ZSAgLCBsaXN0ZW5lcnMucG9pbnRlck1vdmUgICk7XG4gICAgICAgICAgICBldmVudHMuYWRkKGRvYywgcEV2ZW50VHlwZXMub3ZlciAgLCBsaXN0ZW5lcnMucG9pbnRlck92ZXIgICk7XG4gICAgICAgICAgICBldmVudHMuYWRkKGRvYywgcEV2ZW50VHlwZXMub3V0ICAgLCBsaXN0ZW5lcnMucG9pbnRlck91dCAgICk7XG4gICAgICAgICAgICBldmVudHMuYWRkKGRvYywgcEV2ZW50VHlwZXMudXAgICAgLCBsaXN0ZW5lcnMucG9pbnRlclVwICAgICk7XG4gICAgICAgICAgICBldmVudHMuYWRkKGRvYywgcEV2ZW50VHlwZXMuY2FuY2VsLCBsaXN0ZW5lcnMucG9pbnRlckNhbmNlbCk7XG5cbiAgICAgICAgICAgIC8vIGF1dG9zY3JvbGxcbiAgICAgICAgICAgIGV2ZW50cy5hZGQoZG9jLCBwRXZlbnRUeXBlcy5tb3ZlLCBsaXN0ZW5lcnMuYXV0b1Njcm9sbE1vdmUpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgZXZlbnRzLmFkZChkb2MsICdtb3VzZWRvd24nLCBsaXN0ZW5lcnMuc2VsZWN0b3JEb3duKTtcbiAgICAgICAgICAgIGV2ZW50cy5hZGQoZG9jLCAnbW91c2Vtb3ZlJywgbGlzdGVuZXJzLnBvaW50ZXJNb3ZlICk7XG4gICAgICAgICAgICBldmVudHMuYWRkKGRvYywgJ21vdXNldXAnICAsIGxpc3RlbmVycy5wb2ludGVyVXAgICApO1xuICAgICAgICAgICAgZXZlbnRzLmFkZChkb2MsICdtb3VzZW92ZXInLCBsaXN0ZW5lcnMucG9pbnRlck92ZXIgKTtcbiAgICAgICAgICAgIGV2ZW50cy5hZGQoZG9jLCAnbW91c2VvdXQnICwgbGlzdGVuZXJzLnBvaW50ZXJPdXQgICk7XG5cbiAgICAgICAgICAgIGV2ZW50cy5hZGQoZG9jLCAndG91Y2hzdGFydCcgLCBsaXN0ZW5lcnMuc2VsZWN0b3JEb3duICk7XG4gICAgICAgICAgICBldmVudHMuYWRkKGRvYywgJ3RvdWNobW92ZScgICwgbGlzdGVuZXJzLnBvaW50ZXJNb3ZlICApO1xuICAgICAgICAgICAgZXZlbnRzLmFkZChkb2MsICd0b3VjaGVuZCcgICAsIGxpc3RlbmVycy5wb2ludGVyVXAgICAgKTtcbiAgICAgICAgICAgIGV2ZW50cy5hZGQoZG9jLCAndG91Y2hjYW5jZWwnLCBsaXN0ZW5lcnMucG9pbnRlckNhbmNlbCk7XG5cbiAgICAgICAgICAgIC8vIGF1dG9zY3JvbGxcbiAgICAgICAgICAgIGV2ZW50cy5hZGQoZG9jLCAnbW91c2Vtb3ZlJywgbGlzdGVuZXJzLmF1dG9TY3JvbGxNb3ZlKTtcbiAgICAgICAgICAgIGV2ZW50cy5hZGQoZG9jLCAndG91Y2htb3ZlJywgbGlzdGVuZXJzLmF1dG9TY3JvbGxNb3ZlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGV2ZW50cy5hZGQod2luLCAnYmx1cicsIGVuZEFsbEludGVyYWN0aW9ucyk7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmICh3aW4uZnJhbWVFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgdmFyIHBhcmVudERvYyA9IHdpbi5mcmFtZUVsZW1lbnQub3duZXJEb2N1bWVudCxcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50V2luZG93ID0gcGFyZW50RG9jLmRlZmF1bHRWaWV3O1xuXG4gICAgICAgICAgICAgICAgZXZlbnRzLmFkZChwYXJlbnREb2MgICAsICdtb3VzZXVwJyAgICAgICwgbGlzdGVuZXJzLnBvaW50ZXJFbmQpO1xuICAgICAgICAgICAgICAgIGV2ZW50cy5hZGQocGFyZW50RG9jICAgLCAndG91Y2hlbmQnICAgICAsIGxpc3RlbmVycy5wb2ludGVyRW5kKTtcbiAgICAgICAgICAgICAgICBldmVudHMuYWRkKHBhcmVudERvYyAgICwgJ3RvdWNoY2FuY2VsJyAgLCBsaXN0ZW5lcnMucG9pbnRlckVuZCk7XG4gICAgICAgICAgICAgICAgZXZlbnRzLmFkZChwYXJlbnREb2MgICAsICdwb2ludGVydXAnICAgICwgbGlzdGVuZXJzLnBvaW50ZXJFbmQpO1xuICAgICAgICAgICAgICAgIGV2ZW50cy5hZGQocGFyZW50RG9jICAgLCAnTVNQb2ludGVyVXAnICAsIGxpc3RlbmVycy5wb2ludGVyRW5kKTtcbiAgICAgICAgICAgICAgICBldmVudHMuYWRkKHBhcmVudFdpbmRvdywgJ2JsdXInICAgICAgICAgLCBlbmRBbGxJbnRlcmFjdGlvbnMgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGludGVyYWN0LndpbmRvd1BhcmVudEVycm9yID0gZXJyb3I7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBwcmV2ZW50IG5hdGl2ZSBIVE1MNSBkcmFnIG9uIGludGVyYWN0LmpzIHRhcmdldCBlbGVtZW50c1xuICAgICAgICBldmVudHMuYWRkKGRvYywgJ2RyYWdzdGFydCcsIGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBpbnRlcmFjdGlvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgaW50ZXJhY3Rpb24gPSBpbnRlcmFjdGlvbnNbaV07XG5cbiAgICAgICAgICAgICAgICBpZiAoaW50ZXJhY3Rpb24uZWxlbWVudFxuICAgICAgICAgICAgICAgICAgICAmJiAoaW50ZXJhY3Rpb24uZWxlbWVudCA9PT0gZXZlbnQudGFyZ2V0XG4gICAgICAgICAgICAgICAgICAgICAgICB8fCBub2RlQ29udGFpbnMoaW50ZXJhY3Rpb24uZWxlbWVudCwgZXZlbnQudGFyZ2V0KSkpIHtcblxuICAgICAgICAgICAgICAgICAgICBpbnRlcmFjdGlvbi5jaGVja0FuZFByZXZlbnREZWZhdWx0KGV2ZW50LCBpbnRlcmFjdGlvbi50YXJnZXQsIGludGVyYWN0aW9uLmVsZW1lbnQpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBpZiAoZXZlbnRzLnVzZUF0dGFjaEV2ZW50KSB7XG4gICAgICAgICAgICAvLyBGb3IgSUUncyBsYWNrIG9mIEV2ZW50I3ByZXZlbnREZWZhdWx0XG4gICAgICAgICAgICBldmVudHMuYWRkKGRvYywgJ3NlbGVjdHN0YXJ0JywgZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICAgICAgdmFyIGludGVyYWN0aW9uID0gaW50ZXJhY3Rpb25zWzBdO1xuXG4gICAgICAgICAgICAgICAgaWYgKGludGVyYWN0aW9uLmN1cnJlbnRBY3Rpb24oKSkge1xuICAgICAgICAgICAgICAgICAgICBpbnRlcmFjdGlvbi5jaGVja0FuZFByZXZlbnREZWZhdWx0KGV2ZW50KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gRm9yIElFJ3MgYmFkIGRibGNsaWNrIGV2ZW50IHNlcXVlbmNlXG4gICAgICAgICAgICBldmVudHMuYWRkKGRvYywgJ2RibGNsaWNrJywgZG9PbkludGVyYWN0aW9ucygnaWU4RGJsY2xpY2snKSk7XG4gICAgICAgIH1cblxuICAgICAgICBkb2N1bWVudHMucHVzaChkb2MpO1xuICAgIH1cblxuICAgIGxpc3RlblRvRG9jdW1lbnQoZG9jdW1lbnQpO1xuXG4gICAgZnVuY3Rpb24gaW5kZXhPZiAoYXJyYXksIHRhcmdldCkge1xuICAgICAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gYXJyYXkubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChhcnJheVtpXSA9PT0gdGFyZ2V0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gLTE7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY29udGFpbnMgKGFycmF5LCB0YXJnZXQpIHtcbiAgICAgICAgcmV0dXJuIGluZGV4T2YoYXJyYXksIHRhcmdldCkgIT09IC0xO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG1hdGNoZXNTZWxlY3RvciAoZWxlbWVudCwgc2VsZWN0b3IsIG5vZGVMaXN0KSB7XG4gICAgICAgIGlmIChpZThNYXRjaGVzU2VsZWN0b3IpIHtcbiAgICAgICAgICAgIHJldHVybiBpZThNYXRjaGVzU2VsZWN0b3IoZWxlbWVudCwgc2VsZWN0b3IsIG5vZGVMaXN0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHJlbW92ZSAvZGVlcC8gZnJvbSBzZWxlY3RvcnMgaWYgc2hhZG93RE9NIHBvbHlmaWxsIGlzIHVzZWRcbiAgICAgICAgaWYgKHdpbmRvdyAhPT0gcmVhbFdpbmRvdykge1xuICAgICAgICAgICAgc2VsZWN0b3IgPSBzZWxlY3Rvci5yZXBsYWNlKC9cXC9kZWVwXFwvL2csICcgJyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZWxlbWVudFtwcmVmaXhlZE1hdGNoZXNTZWxlY3Rvcl0oc2VsZWN0b3IpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG1hdGNoZXNVcFRvIChlbGVtZW50LCBzZWxlY3RvciwgbGltaXQpIHtcbiAgICAgICAgd2hpbGUgKGlzRWxlbWVudChlbGVtZW50KSkge1xuICAgICAgICAgICAgaWYgKG1hdGNoZXNTZWxlY3RvcihlbGVtZW50LCBzZWxlY3RvcikpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZWxlbWVudCA9IHBhcmVudEVsZW1lbnQoZWxlbWVudCk7XG5cbiAgICAgICAgICAgIGlmIChlbGVtZW50ID09PSBsaW1pdCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBtYXRjaGVzU2VsZWN0b3IoZWxlbWVudCwgc2VsZWN0b3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIC8vIEZvciBJRTgncyBsYWNrIG9mIGFuIEVsZW1lbnQjbWF0Y2hlc1NlbGVjdG9yXG4gICAgLy8gdGFrZW4gZnJvbSBodHRwOi8vdGFuYWxpbi5jb20vZW4vYmxvZy8yMDEyLzEyL21hdGNoZXMtc2VsZWN0b3ItaWU4LyBhbmQgbW9kaWZpZWRcbiAgICBpZiAoIShwcmVmaXhlZE1hdGNoZXNTZWxlY3RvciBpbiBFbGVtZW50LnByb3RvdHlwZSkgfHwgIWlzRnVuY3Rpb24oRWxlbWVudC5wcm90b3R5cGVbcHJlZml4ZWRNYXRjaGVzU2VsZWN0b3JdKSkge1xuICAgICAgICBpZThNYXRjaGVzU2VsZWN0b3IgPSBmdW5jdGlvbiAoZWxlbWVudCwgc2VsZWN0b3IsIGVsZW1zKSB7XG4gICAgICAgICAgICBlbGVtcyA9IGVsZW1zIHx8IGVsZW1lbnQucGFyZW50Tm9kZS5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKTtcblxuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGVsZW1zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVsZW1zW2ldID09PSBlbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIC8vIHJlcXVlc3RBbmltYXRpb25GcmFtZSBwb2x5ZmlsbFxuICAgIChmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGxhc3RUaW1lID0gMCxcbiAgICAgICAgICAgIHZlbmRvcnMgPSBbJ21zJywgJ21veicsICd3ZWJraXQnLCAnbyddO1xuXG4gICAgICAgIGZvcih2YXIgeCA9IDA7IHggPCB2ZW5kb3JzLmxlbmd0aCAmJiAhcmVhbFdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWU7ICsreCkge1xuICAgICAgICAgICAgcmVxRnJhbWUgPSByZWFsV2luZG93W3ZlbmRvcnNbeF0rJ1JlcXVlc3RBbmltYXRpb25GcmFtZSddO1xuICAgICAgICAgICAgY2FuY2VsRnJhbWUgPSByZWFsV2luZG93W3ZlbmRvcnNbeF0rJ0NhbmNlbEFuaW1hdGlvbkZyYW1lJ10gfHwgcmVhbFdpbmRvd1t2ZW5kb3JzW3hdKydDYW5jZWxSZXF1ZXN0QW5pbWF0aW9uRnJhbWUnXTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghcmVxRnJhbWUpIHtcbiAgICAgICAgICAgIHJlcUZyYW1lID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICB2YXIgY3VyclRpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKSxcbiAgICAgICAgICAgICAgICAgICAgdGltZVRvQ2FsbCA9IE1hdGgubWF4KDAsIDE2IC0gKGN1cnJUaW1lIC0gbGFzdFRpbWUpKSxcbiAgICAgICAgICAgICAgICAgICAgaWQgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkgeyBjYWxsYmFjayhjdXJyVGltZSArIHRpbWVUb0NhbGwpOyB9LFxuICAgICAgICAgICAgICAgICAgdGltZVRvQ2FsbCk7XG4gICAgICAgICAgICAgICAgbGFzdFRpbWUgPSBjdXJyVGltZSArIHRpbWVUb0NhbGw7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGlkO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghY2FuY2VsRnJhbWUpIHtcbiAgICAgICAgICAgIGNhbmNlbEZyYW1lID0gZnVuY3Rpb24oaWQpIHtcbiAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQoaWQpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH0oKSk7XG5cbiAgICAvKiBnbG9iYWwgZXhwb3J0czogdHJ1ZSwgbW9kdWxlLCBkZWZpbmUgKi9cblxuICAgIC8vIGh0dHA6Ly9kb2N1bWVudGNsb3VkLmdpdGh1Yi5pby91bmRlcnNjb3JlL2RvY3MvdW5kZXJzY29yZS5odG1sI3NlY3Rpb24tMTFcbiAgICBpZiAodHlwZW9mIGV4cG9ydHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIGlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiBtb2R1bGUuZXhwb3J0cykge1xuICAgICAgICAgICAgZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gaW50ZXJhY3Q7XG4gICAgICAgIH1cbiAgICAgICAgZXhwb3J0cy5pbnRlcmFjdCA9IGludGVyYWN0O1xuICAgIH1cbiAgICAvLyBBTURcbiAgICBlbHNlIGlmICh0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpIHtcbiAgICAgICAgZGVmaW5lKCdpbnRlcmFjdCcsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIGludGVyYWN0O1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHJlYWxXaW5kb3cuaW50ZXJhY3QgPSBpbnRlcmFjdDtcbiAgICB9XG5cbn0gKHR5cGVvZiB3aW5kb3cgPT09ICd1bmRlZmluZWQnPyB1bmRlZmluZWQgOiB3aW5kb3cpKTtcbiIsInZhciBpc09iamVjdCA9IHJlcXVpcmUoJy4vaXNPYmplY3QnKSxcbiAgICBub3cgPSByZXF1aXJlKCcuL25vdycpLFxuICAgIHRvTnVtYmVyID0gcmVxdWlyZSgnLi90b051bWJlcicpO1xuXG4vKiogVXNlZCBhcyB0aGUgYFR5cGVFcnJvcmAgbWVzc2FnZSBmb3IgXCJGdW5jdGlvbnNcIiBtZXRob2RzLiAqL1xudmFyIEZVTkNfRVJST1JfVEVYVCA9ICdFeHBlY3RlZCBhIGZ1bmN0aW9uJztcblxuLyogQnVpbHQtaW4gbWV0aG9kIHJlZmVyZW5jZXMgZm9yIHRob3NlIHdpdGggdGhlIHNhbWUgbmFtZSBhcyBvdGhlciBgbG9kYXNoYCBtZXRob2RzLiAqL1xudmFyIG5hdGl2ZU1heCA9IE1hdGgubWF4O1xuXG4vKipcbiAqIENyZWF0ZXMgYSBkZWJvdW5jZWQgZnVuY3Rpb24gdGhhdCBkZWxheXMgaW52b2tpbmcgYGZ1bmNgIHVudGlsIGFmdGVyIGB3YWl0YFxuICogbWlsbGlzZWNvbmRzIGhhdmUgZWxhcHNlZCBzaW5jZSB0aGUgbGFzdCB0aW1lIHRoZSBkZWJvdW5jZWQgZnVuY3Rpb24gd2FzXG4gKiBpbnZva2VkLiBUaGUgZGVib3VuY2VkIGZ1bmN0aW9uIGNvbWVzIHdpdGggYSBgY2FuY2VsYCBtZXRob2QgdG8gY2FuY2VsXG4gKiBkZWxheWVkIGBmdW5jYCBpbnZvY2F0aW9ucyBhbmQgYSBgZmx1c2hgIG1ldGhvZCB0byBpbW1lZGlhdGVseSBpbnZva2UgdGhlbS5cbiAqIFByb3ZpZGUgYW4gb3B0aW9ucyBvYmplY3QgdG8gaW5kaWNhdGUgd2hldGhlciBgZnVuY2Agc2hvdWxkIGJlIGludm9rZWQgb25cbiAqIHRoZSBsZWFkaW5nIGFuZC9vciB0cmFpbGluZyBlZGdlIG9mIHRoZSBgd2FpdGAgdGltZW91dC4gVGhlIGBmdW5jYCBpcyBpbnZva2VkXG4gKiB3aXRoIHRoZSBsYXN0IGFyZ3VtZW50cyBwcm92aWRlZCB0byB0aGUgZGVib3VuY2VkIGZ1bmN0aW9uLiBTdWJzZXF1ZW50IGNhbGxzXG4gKiB0byB0aGUgZGVib3VuY2VkIGZ1bmN0aW9uIHJldHVybiB0aGUgcmVzdWx0IG9mIHRoZSBsYXN0IGBmdW5jYCBpbnZvY2F0aW9uLlxuICpcbiAqICoqTm90ZToqKiBJZiBgbGVhZGluZ2AgYW5kIGB0cmFpbGluZ2Agb3B0aW9ucyBhcmUgYHRydWVgLCBgZnVuY2AgaXMgaW52b2tlZFxuICogb24gdGhlIHRyYWlsaW5nIGVkZ2Ugb2YgdGhlIHRpbWVvdXQgb25seSBpZiB0aGUgZGVib3VuY2VkIGZ1bmN0aW9uIGlzXG4gKiBpbnZva2VkIG1vcmUgdGhhbiBvbmNlIGR1cmluZyB0aGUgYHdhaXRgIHRpbWVvdXQuXG4gKlxuICogU2VlIFtEYXZpZCBDb3JiYWNobydzIGFydGljbGVdKGh0dHA6Ly9kcnVwYWxtb3Rpb24uY29tL2FydGljbGUvZGVib3VuY2UtYW5kLXRocm90dGxlLXZpc3VhbC1leHBsYW5hdGlvbilcbiAqIGZvciBkZXRhaWxzIG92ZXIgdGhlIGRpZmZlcmVuY2VzIGJldHdlZW4gYF8uZGVib3VuY2VgIGFuZCBgXy50aHJvdHRsZWAuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBGdW5jdGlvblxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBUaGUgZnVuY3Rpb24gdG8gZGVib3VuY2UuXG4gKiBAcGFyYW0ge251bWJlcn0gW3dhaXQ9MF0gVGhlIG51bWJlciBvZiBtaWxsaXNlY29uZHMgdG8gZGVsYXkuXG4gKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdIFRoZSBvcHRpb25zIG9iamVjdC5cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW29wdGlvbnMubGVhZGluZz1mYWxzZV0gU3BlY2lmeSBpbnZva2luZyBvbiB0aGUgbGVhZGluZ1xuICogIGVkZ2Ugb2YgdGhlIHRpbWVvdXQuXG4gKiBAcGFyYW0ge251bWJlcn0gW29wdGlvbnMubWF4V2FpdF0gVGhlIG1heGltdW0gdGltZSBgZnVuY2AgaXMgYWxsb3dlZCB0byBiZVxuICogIGRlbGF5ZWQgYmVmb3JlIGl0J3MgaW52b2tlZC5cbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW29wdGlvbnMudHJhaWxpbmc9dHJ1ZV0gU3BlY2lmeSBpbnZva2luZyBvbiB0aGUgdHJhaWxpbmdcbiAqICBlZGdlIG9mIHRoZSB0aW1lb3V0LlxuICogQHJldHVybnMge0Z1bmN0aW9ufSBSZXR1cm5zIHRoZSBuZXcgZGVib3VuY2VkIGZ1bmN0aW9uLlxuICogQGV4YW1wbGVcbiAqXG4gKiAvLyBBdm9pZCBjb3N0bHkgY2FsY3VsYXRpb25zIHdoaWxlIHRoZSB3aW5kb3cgc2l6ZSBpcyBpbiBmbHV4LlxuICogalF1ZXJ5KHdpbmRvdykub24oJ3Jlc2l6ZScsIF8uZGVib3VuY2UoY2FsY3VsYXRlTGF5b3V0LCAxNTApKTtcbiAqXG4gKiAvLyBJbnZva2UgYHNlbmRNYWlsYCB3aGVuIGNsaWNrZWQsIGRlYm91bmNpbmcgc3Vic2VxdWVudCBjYWxscy5cbiAqIGpRdWVyeShlbGVtZW50KS5vbignY2xpY2snLCBfLmRlYm91bmNlKHNlbmRNYWlsLCAzMDAsIHtcbiAqICAgJ2xlYWRpbmcnOiB0cnVlLFxuICogICAndHJhaWxpbmcnOiBmYWxzZVxuICogfSkpO1xuICpcbiAqIC8vIEVuc3VyZSBgYmF0Y2hMb2dgIGlzIGludm9rZWQgb25jZSBhZnRlciAxIHNlY29uZCBvZiBkZWJvdW5jZWQgY2FsbHMuXG4gKiB2YXIgZGVib3VuY2VkID0gXy5kZWJvdW5jZShiYXRjaExvZywgMjUwLCB7ICdtYXhXYWl0JzogMTAwMCB9KTtcbiAqIHZhciBzb3VyY2UgPSBuZXcgRXZlbnRTb3VyY2UoJy9zdHJlYW0nKTtcbiAqIGpRdWVyeShzb3VyY2UpLm9uKCdtZXNzYWdlJywgZGVib3VuY2VkKTtcbiAqXG4gKiAvLyBDYW5jZWwgdGhlIHRyYWlsaW5nIGRlYm91bmNlZCBpbnZvY2F0aW9uLlxuICogalF1ZXJ5KHdpbmRvdykub24oJ3BvcHN0YXRlJywgZGVib3VuY2VkLmNhbmNlbCk7XG4gKi9cbmZ1bmN0aW9uIGRlYm91bmNlKGZ1bmMsIHdhaXQsIG9wdGlvbnMpIHtcbiAgdmFyIGFyZ3MsXG4gICAgICBtYXhUaW1lb3V0SWQsXG4gICAgICByZXN1bHQsXG4gICAgICBzdGFtcCxcbiAgICAgIHRoaXNBcmcsXG4gICAgICB0aW1lb3V0SWQsXG4gICAgICB0cmFpbGluZ0NhbGwsXG4gICAgICBsYXN0Q2FsbGVkID0gMCxcbiAgICAgIGxlYWRpbmcgPSBmYWxzZSxcbiAgICAgIG1heFdhaXQgPSBmYWxzZSxcbiAgICAgIHRyYWlsaW5nID0gdHJ1ZTtcblxuICBpZiAodHlwZW9mIGZ1bmMgIT0gJ2Z1bmN0aW9uJykge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoRlVOQ19FUlJPUl9URVhUKTtcbiAgfVxuICB3YWl0ID0gdG9OdW1iZXIod2FpdCkgfHwgMDtcbiAgaWYgKGlzT2JqZWN0KG9wdGlvbnMpKSB7XG4gICAgbGVhZGluZyA9ICEhb3B0aW9ucy5sZWFkaW5nO1xuICAgIG1heFdhaXQgPSAnbWF4V2FpdCcgaW4gb3B0aW9ucyAmJiBuYXRpdmVNYXgodG9OdW1iZXIob3B0aW9ucy5tYXhXYWl0KSB8fCAwLCB3YWl0KTtcbiAgICB0cmFpbGluZyA9ICd0cmFpbGluZycgaW4gb3B0aW9ucyA/ICEhb3B0aW9ucy50cmFpbGluZyA6IHRyYWlsaW5nO1xuICB9XG5cbiAgZnVuY3Rpb24gY2FuY2VsKCkge1xuICAgIGlmICh0aW1lb3V0SWQpIHtcbiAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0SWQpO1xuICAgIH1cbiAgICBpZiAobWF4VGltZW91dElkKSB7XG4gICAgICBjbGVhclRpbWVvdXQobWF4VGltZW91dElkKTtcbiAgICB9XG4gICAgbGFzdENhbGxlZCA9IDA7XG4gICAgYXJncyA9IG1heFRpbWVvdXRJZCA9IHRoaXNBcmcgPSB0aW1lb3V0SWQgPSB0cmFpbGluZ0NhbGwgPSB1bmRlZmluZWQ7XG4gIH1cblxuICBmdW5jdGlvbiBjb21wbGV0ZShpc0NhbGxlZCwgaWQpIHtcbiAgICBpZiAoaWQpIHtcbiAgICAgIGNsZWFyVGltZW91dChpZCk7XG4gICAgfVxuICAgIG1heFRpbWVvdXRJZCA9IHRpbWVvdXRJZCA9IHRyYWlsaW5nQ2FsbCA9IHVuZGVmaW5lZDtcbiAgICBpZiAoaXNDYWxsZWQpIHtcbiAgICAgIGxhc3RDYWxsZWQgPSBub3coKTtcbiAgICAgIHJlc3VsdCA9IGZ1bmMuYXBwbHkodGhpc0FyZywgYXJncyk7XG4gICAgICBpZiAoIXRpbWVvdXRJZCAmJiAhbWF4VGltZW91dElkKSB7XG4gICAgICAgIGFyZ3MgPSB0aGlzQXJnID0gdW5kZWZpbmVkO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGRlbGF5ZWQoKSB7XG4gICAgdmFyIHJlbWFpbmluZyA9IHdhaXQgLSAobm93KCkgLSBzdGFtcCk7XG4gICAgaWYgKHJlbWFpbmluZyA8PSAwIHx8IHJlbWFpbmluZyA+IHdhaXQpIHtcbiAgICAgIGNvbXBsZXRlKHRyYWlsaW5nQ2FsbCwgbWF4VGltZW91dElkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGltZW91dElkID0gc2V0VGltZW91dChkZWxheWVkLCByZW1haW5pbmcpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGZsdXNoKCkge1xuICAgIGlmICgodGltZW91dElkICYmIHRyYWlsaW5nQ2FsbCkgfHwgKG1heFRpbWVvdXRJZCAmJiB0cmFpbGluZykpIHtcbiAgICAgIHJlc3VsdCA9IGZ1bmMuYXBwbHkodGhpc0FyZywgYXJncyk7XG4gICAgfVxuICAgIGNhbmNlbCgpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBmdW5jdGlvbiBtYXhEZWxheWVkKCkge1xuICAgIGNvbXBsZXRlKHRyYWlsaW5nLCB0aW1lb3V0SWQpO1xuICB9XG5cbiAgZnVuY3Rpb24gZGVib3VuY2VkKCkge1xuICAgIGFyZ3MgPSBhcmd1bWVudHM7XG4gICAgc3RhbXAgPSBub3coKTtcbiAgICB0aGlzQXJnID0gdGhpcztcbiAgICB0cmFpbGluZ0NhbGwgPSB0cmFpbGluZyAmJiAodGltZW91dElkIHx8ICFsZWFkaW5nKTtcblxuICAgIGlmIChtYXhXYWl0ID09PSBmYWxzZSkge1xuICAgICAgdmFyIGxlYWRpbmdDYWxsID0gbGVhZGluZyAmJiAhdGltZW91dElkO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoIWxhc3RDYWxsZWQgJiYgIW1heFRpbWVvdXRJZCAmJiAhbGVhZGluZykge1xuICAgICAgICBsYXN0Q2FsbGVkID0gc3RhbXA7XG4gICAgICB9XG4gICAgICB2YXIgcmVtYWluaW5nID0gbWF4V2FpdCAtIChzdGFtcCAtIGxhc3RDYWxsZWQpO1xuXG4gICAgICB2YXIgaXNDYWxsZWQgPSAocmVtYWluaW5nIDw9IDAgfHwgcmVtYWluaW5nID4gbWF4V2FpdCkgJiZcbiAgICAgICAgKGxlYWRpbmcgfHwgbWF4VGltZW91dElkKTtcblxuICAgICAgaWYgKGlzQ2FsbGVkKSB7XG4gICAgICAgIGlmIChtYXhUaW1lb3V0SWQpIHtcbiAgICAgICAgICBtYXhUaW1lb3V0SWQgPSBjbGVhclRpbWVvdXQobWF4VGltZW91dElkKTtcbiAgICAgICAgfVxuICAgICAgICBsYXN0Q2FsbGVkID0gc3RhbXA7XG4gICAgICAgIHJlc3VsdCA9IGZ1bmMuYXBwbHkodGhpc0FyZywgYXJncyk7XG4gICAgICB9XG4gICAgICBlbHNlIGlmICghbWF4VGltZW91dElkKSB7XG4gICAgICAgIG1heFRpbWVvdXRJZCA9IHNldFRpbWVvdXQobWF4RGVsYXllZCwgcmVtYWluaW5nKTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGlzQ2FsbGVkICYmIHRpbWVvdXRJZCkge1xuICAgICAgdGltZW91dElkID0gY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7XG4gICAgfVxuICAgIGVsc2UgaWYgKCF0aW1lb3V0SWQgJiYgd2FpdCAhPT0gbWF4V2FpdCkge1xuICAgICAgdGltZW91dElkID0gc2V0VGltZW91dChkZWxheWVkLCB3YWl0KTtcbiAgICB9XG4gICAgaWYgKGxlYWRpbmdDYWxsKSB7XG4gICAgICBpc0NhbGxlZCA9IHRydWU7XG4gICAgICByZXN1bHQgPSBmdW5jLmFwcGx5KHRoaXNBcmcsIGFyZ3MpO1xuICAgIH1cbiAgICBpZiAoaXNDYWxsZWQgJiYgIXRpbWVvdXRJZCAmJiAhbWF4VGltZW91dElkKSB7XG4gICAgICBhcmdzID0gdGhpc0FyZyA9IHVuZGVmaW5lZDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuICBkZWJvdW5jZWQuY2FuY2VsID0gY2FuY2VsO1xuICBkZWJvdW5jZWQuZmx1c2ggPSBmbHVzaDtcbiAgcmV0dXJuIGRlYm91bmNlZDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBkZWJvdW5jZTtcbiIsInZhciBpc09iamVjdCA9IHJlcXVpcmUoJy4vaXNPYmplY3QnKTtcblxuLyoqIGBPYmplY3QjdG9TdHJpbmdgIHJlc3VsdCByZWZlcmVuY2VzLiAqL1xudmFyIGZ1bmNUYWcgPSAnW29iamVjdCBGdW5jdGlvbl0nLFxuICAgIGdlblRhZyA9ICdbb2JqZWN0IEdlbmVyYXRvckZ1bmN0aW9uXSc7XG5cbi8qKiBVc2VkIGZvciBidWlsdC1pbiBtZXRob2QgcmVmZXJlbmNlcy4gKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKlxuICogVXNlZCB0byByZXNvbHZlIHRoZSBbYHRvU3RyaW5nVGFnYF0oaHR0cDovL2VjbWEtaW50ZXJuYXRpb25hbC5vcmcvZWNtYS0yNjIvNi4wLyNzZWMtb2JqZWN0LnByb3RvdHlwZS50b3N0cmluZylcbiAqIG9mIHZhbHVlcy5cbiAqL1xudmFyIG9iamVjdFRvU3RyaW5nID0gb2JqZWN0UHJvdG8udG9TdHJpbmc7XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgY2xhc3NpZmllZCBhcyBhIGBGdW5jdGlvbmAgb2JqZWN0LlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBjb3JyZWN0bHkgY2xhc3NpZmllZCwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzRnVuY3Rpb24oXyk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc0Z1bmN0aW9uKC9hYmMvKTtcbiAqIC8vID0+IGZhbHNlXG4gKi9cbmZ1bmN0aW9uIGlzRnVuY3Rpb24odmFsdWUpIHtcbiAgLy8gVGhlIHVzZSBvZiBgT2JqZWN0I3RvU3RyaW5nYCBhdm9pZHMgaXNzdWVzIHdpdGggdGhlIGB0eXBlb2ZgIG9wZXJhdG9yXG4gIC8vIGluIFNhZmFyaSA4IHdoaWNoIHJldHVybnMgJ29iamVjdCcgZm9yIHR5cGVkIGFycmF5IGNvbnN0cnVjdG9ycywgYW5kXG4gIC8vIFBoYW50b21KUyAxLjkgd2hpY2ggcmV0dXJucyAnZnVuY3Rpb24nIGZvciBgTm9kZUxpc3RgIGluc3RhbmNlcy5cbiAgdmFyIHRhZyA9IGlzT2JqZWN0KHZhbHVlKSA/IG9iamVjdFRvU3RyaW5nLmNhbGwodmFsdWUpIDogJyc7XG4gIHJldHVybiB0YWcgPT0gZnVuY1RhZyB8fCB0YWcgPT0gZ2VuVGFnO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzRnVuY3Rpb247XG4iLCIvKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIHRoZSBbbGFuZ3VhZ2UgdHlwZV0oaHR0cHM6Ly9lczUuZ2l0aHViLmlvLyN4OCkgb2YgYE9iamVjdGAuXG4gKiAoZS5nLiBhcnJheXMsIGZ1bmN0aW9ucywgb2JqZWN0cywgcmVnZXhlcywgYG5ldyBOdW1iZXIoMClgLCBhbmQgYG5ldyBTdHJpbmcoJycpYClcbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IExhbmdcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgYW4gb2JqZWN0LCBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uaXNPYmplY3Qoe30pO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNPYmplY3QoWzEsIDIsIDNdKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzT2JqZWN0KF8ubm9vcCk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc09iamVjdChudWxsKTtcbiAqIC8vID0+IGZhbHNlXG4gKi9cbmZ1bmN0aW9uIGlzT2JqZWN0KHZhbHVlKSB7XG4gIHZhciB0eXBlID0gdHlwZW9mIHZhbHVlO1xuICByZXR1cm4gISF2YWx1ZSAmJiAodHlwZSA9PSAnb2JqZWN0JyB8fCB0eXBlID09ICdmdW5jdGlvbicpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzT2JqZWN0O1xuIiwiLyoqXG4gKiBHZXRzIHRoZSB0aW1lc3RhbXAgb2YgdGhlIG51bWJlciBvZiBtaWxsaXNlY29uZHMgdGhhdCBoYXZlIGVsYXBzZWQgc2luY2VcbiAqIHRoZSBVbml4IGVwb2NoICgxIEphbnVhcnkgMTk3MCAwMDowMDowMCBVVEMpLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAdHlwZSB7RnVuY3Rpb259XG4gKiBAY2F0ZWdvcnkgRGF0ZVxuICogQHJldHVybnMge251bWJlcn0gUmV0dXJucyB0aGUgdGltZXN0YW1wLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmRlZmVyKGZ1bmN0aW9uKHN0YW1wKSB7XG4gKiAgIGNvbnNvbGUubG9nKF8ubm93KCkgLSBzdGFtcCk7XG4gKiB9LCBfLm5vdygpKTtcbiAqIC8vID0+IGxvZ3MgdGhlIG51bWJlciBvZiBtaWxsaXNlY29uZHMgaXQgdG9vayBmb3IgdGhlIGRlZmVycmVkIGZ1bmN0aW9uIHRvIGJlIGludm9rZWRcbiAqL1xudmFyIG5vdyA9IERhdGUubm93O1xuXG5tb2R1bGUuZXhwb3J0cyA9IG5vdztcbiIsInZhciBkZWJvdW5jZSA9IHJlcXVpcmUoJy4vZGVib3VuY2UnKSxcbiAgICBpc09iamVjdCA9IHJlcXVpcmUoJy4vaXNPYmplY3QnKTtcblxuLyoqIFVzZWQgYXMgdGhlIGBUeXBlRXJyb3JgIG1lc3NhZ2UgZm9yIFwiRnVuY3Rpb25zXCIgbWV0aG9kcy4gKi9cbnZhciBGVU5DX0VSUk9SX1RFWFQgPSAnRXhwZWN0ZWQgYSBmdW5jdGlvbic7XG5cbi8qKlxuICogQ3JlYXRlcyBhIHRocm90dGxlZCBmdW5jdGlvbiB0aGF0IG9ubHkgaW52b2tlcyBgZnVuY2AgYXQgbW9zdCBvbmNlIHBlclxuICogZXZlcnkgYHdhaXRgIG1pbGxpc2Vjb25kcy4gVGhlIHRocm90dGxlZCBmdW5jdGlvbiBjb21lcyB3aXRoIGEgYGNhbmNlbGBcbiAqIG1ldGhvZCB0byBjYW5jZWwgZGVsYXllZCBgZnVuY2AgaW52b2NhdGlvbnMgYW5kIGEgYGZsdXNoYCBtZXRob2QgdG9cbiAqIGltbWVkaWF0ZWx5IGludm9rZSB0aGVtLiBQcm92aWRlIGFuIG9wdGlvbnMgb2JqZWN0IHRvIGluZGljYXRlIHdoZXRoZXJcbiAqIGBmdW5jYCBzaG91bGQgYmUgaW52b2tlZCBvbiB0aGUgbGVhZGluZyBhbmQvb3IgdHJhaWxpbmcgZWRnZSBvZiB0aGUgYHdhaXRgXG4gKiB0aW1lb3V0LiBUaGUgYGZ1bmNgIGlzIGludm9rZWQgd2l0aCB0aGUgbGFzdCBhcmd1bWVudHMgcHJvdmlkZWQgdG8gdGhlXG4gKiB0aHJvdHRsZWQgZnVuY3Rpb24uIFN1YnNlcXVlbnQgY2FsbHMgdG8gdGhlIHRocm90dGxlZCBmdW5jdGlvbiByZXR1cm4gdGhlXG4gKiByZXN1bHQgb2YgdGhlIGxhc3QgYGZ1bmNgIGludm9jYXRpb24uXG4gKlxuICogKipOb3RlOioqIElmIGBsZWFkaW5nYCBhbmQgYHRyYWlsaW5nYCBvcHRpb25zIGFyZSBgdHJ1ZWAsIGBmdW5jYCBpcyBpbnZva2VkXG4gKiBvbiB0aGUgdHJhaWxpbmcgZWRnZSBvZiB0aGUgdGltZW91dCBvbmx5IGlmIHRoZSB0aHJvdHRsZWQgZnVuY3Rpb24gaXNcbiAqIGludm9rZWQgbW9yZSB0aGFuIG9uY2UgZHVyaW5nIHRoZSBgd2FpdGAgdGltZW91dC5cbiAqXG4gKiBTZWUgW0RhdmlkIENvcmJhY2hvJ3MgYXJ0aWNsZV0oaHR0cDovL2RydXBhbG1vdGlvbi5jb20vYXJ0aWNsZS9kZWJvdW5jZS1hbmQtdGhyb3R0bGUtdmlzdWFsLWV4cGxhbmF0aW9uKVxuICogZm9yIGRldGFpbHMgb3ZlciB0aGUgZGlmZmVyZW5jZXMgYmV0d2VlbiBgXy50aHJvdHRsZWAgYW5kIGBfLmRlYm91bmNlYC5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IEZ1bmN0aW9uXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIFRoZSBmdW5jdGlvbiB0byB0aHJvdHRsZS5cbiAqIEBwYXJhbSB7bnVtYmVyfSBbd2FpdD0wXSBUaGUgbnVtYmVyIG9mIG1pbGxpc2Vjb25kcyB0byB0aHJvdHRsZSBpbnZvY2F0aW9ucyB0by5cbiAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc10gVGhlIG9wdGlvbnMgb2JqZWN0LlxuICogQHBhcmFtIHtib29sZWFufSBbb3B0aW9ucy5sZWFkaW5nPXRydWVdIFNwZWNpZnkgaW52b2tpbmcgb24gdGhlIGxlYWRpbmdcbiAqICBlZGdlIG9mIHRoZSB0aW1lb3V0LlxuICogQHBhcmFtIHtib29sZWFufSBbb3B0aW9ucy50cmFpbGluZz10cnVlXSBTcGVjaWZ5IGludm9raW5nIG9uIHRoZSB0cmFpbGluZ1xuICogIGVkZ2Ugb2YgdGhlIHRpbWVvdXQuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IFJldHVybnMgdGhlIG5ldyB0aHJvdHRsZWQgZnVuY3Rpb24uXG4gKiBAZXhhbXBsZVxuICpcbiAqIC8vIEF2b2lkIGV4Y2Vzc2l2ZWx5IHVwZGF0aW5nIHRoZSBwb3NpdGlvbiB3aGlsZSBzY3JvbGxpbmcuXG4gKiBqUXVlcnkod2luZG93KS5vbignc2Nyb2xsJywgXy50aHJvdHRsZSh1cGRhdGVQb3NpdGlvbiwgMTAwKSk7XG4gKlxuICogLy8gSW52b2tlIGByZW5ld1Rva2VuYCB3aGVuIHRoZSBjbGljayBldmVudCBpcyBmaXJlZCwgYnV0IG5vdCBtb3JlIHRoYW4gb25jZSBldmVyeSA1IG1pbnV0ZXMuXG4gKiB2YXIgdGhyb3R0bGVkID0gXy50aHJvdHRsZShyZW5ld1Rva2VuLCAzMDAwMDAsIHsgJ3RyYWlsaW5nJzogZmFsc2UgfSk7XG4gKiBqUXVlcnkoZWxlbWVudCkub24oJ2NsaWNrJywgdGhyb3R0bGVkKTtcbiAqXG4gKiAvLyBDYW5jZWwgdGhlIHRyYWlsaW5nIHRocm90dGxlZCBpbnZvY2F0aW9uLlxuICogalF1ZXJ5KHdpbmRvdykub24oJ3BvcHN0YXRlJywgdGhyb3R0bGVkLmNhbmNlbCk7XG4gKi9cbmZ1bmN0aW9uIHRocm90dGxlKGZ1bmMsIHdhaXQsIG9wdGlvbnMpIHtcbiAgdmFyIGxlYWRpbmcgPSB0cnVlLFxuICAgICAgdHJhaWxpbmcgPSB0cnVlO1xuXG4gIGlmICh0eXBlb2YgZnVuYyAhPSAnZnVuY3Rpb24nKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihGVU5DX0VSUk9SX1RFWFQpO1xuICB9XG4gIGlmIChpc09iamVjdChvcHRpb25zKSkge1xuICAgIGxlYWRpbmcgPSAnbGVhZGluZycgaW4gb3B0aW9ucyA/ICEhb3B0aW9ucy5sZWFkaW5nIDogbGVhZGluZztcbiAgICB0cmFpbGluZyA9ICd0cmFpbGluZycgaW4gb3B0aW9ucyA/ICEhb3B0aW9ucy50cmFpbGluZyA6IHRyYWlsaW5nO1xuICB9XG4gIHJldHVybiBkZWJvdW5jZShmdW5jLCB3YWl0LCB7XG4gICAgJ2xlYWRpbmcnOiBsZWFkaW5nLFxuICAgICdtYXhXYWl0Jzogd2FpdCxcbiAgICAndHJhaWxpbmcnOiB0cmFpbGluZ1xuICB9KTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB0aHJvdHRsZTtcbiIsInZhciBpc0Z1bmN0aW9uID0gcmVxdWlyZSgnLi9pc0Z1bmN0aW9uJyksXG4gICAgaXNPYmplY3QgPSByZXF1aXJlKCcuL2lzT2JqZWN0Jyk7XG5cbi8qKiBVc2VkIGFzIHJlZmVyZW5jZXMgZm9yIHZhcmlvdXMgYE51bWJlcmAgY29uc3RhbnRzLiAqL1xudmFyIE5BTiA9IDAgLyAwO1xuXG4vKiogVXNlZCB0byBtYXRjaCBsZWFkaW5nIGFuZCB0cmFpbGluZyB3aGl0ZXNwYWNlLiAqL1xudmFyIHJlVHJpbSA9IC9eXFxzK3xcXHMrJC9nO1xuXG4vKiogVXNlZCB0byBkZXRlY3QgYmFkIHNpZ25lZCBoZXhhZGVjaW1hbCBzdHJpbmcgdmFsdWVzLiAqL1xudmFyIHJlSXNCYWRIZXggPSAvXlstK10weFswLTlhLWZdKyQvaTtcblxuLyoqIFVzZWQgdG8gZGV0ZWN0IGJpbmFyeSBzdHJpbmcgdmFsdWVzLiAqL1xudmFyIHJlSXNCaW5hcnkgPSAvXjBiWzAxXSskL2k7XG5cbi8qKiBVc2VkIHRvIGRldGVjdCBvY3RhbCBzdHJpbmcgdmFsdWVzLiAqL1xudmFyIHJlSXNPY3RhbCA9IC9eMG9bMC03XSskL2k7XG5cbi8qKiBCdWlsdC1pbiBtZXRob2QgcmVmZXJlbmNlcyB3aXRob3V0IGEgZGVwZW5kZW5jeSBvbiBgcm9vdGAuICovXG52YXIgZnJlZVBhcnNlSW50ID0gcGFyc2VJbnQ7XG5cbi8qKlxuICogQ29udmVydHMgYHZhbHVlYCB0byBhIG51bWJlci5cbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IExhbmdcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIHByb2Nlc3MuXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBSZXR1cm5zIHRoZSBudW1iZXIuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8udG9OdW1iZXIoMyk7XG4gKiAvLyA9PiAzXG4gKlxuICogXy50b051bWJlcihOdW1iZXIuTUlOX1ZBTFVFKTtcbiAqIC8vID0+IDVlLTMyNFxuICpcbiAqIF8udG9OdW1iZXIoSW5maW5pdHkpO1xuICogLy8gPT4gSW5maW5pdHlcbiAqXG4gKiBfLnRvTnVtYmVyKCczJyk7XG4gKiAvLyA9PiAzXG4gKi9cbmZ1bmN0aW9uIHRvTnVtYmVyKHZhbHVlKSB7XG4gIGlmIChpc09iamVjdCh2YWx1ZSkpIHtcbiAgICB2YXIgb3RoZXIgPSBpc0Z1bmN0aW9uKHZhbHVlLnZhbHVlT2YpID8gdmFsdWUudmFsdWVPZigpIDogdmFsdWU7XG4gICAgdmFsdWUgPSBpc09iamVjdChvdGhlcikgPyAob3RoZXIgKyAnJykgOiBvdGhlcjtcbiAgfVxuICBpZiAodHlwZW9mIHZhbHVlICE9ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIHZhbHVlID09PSAwID8gdmFsdWUgOiArdmFsdWU7XG4gIH1cbiAgdmFsdWUgPSB2YWx1ZS5yZXBsYWNlKHJlVHJpbSwgJycpO1xuICB2YXIgaXNCaW5hcnkgPSByZUlzQmluYXJ5LnRlc3QodmFsdWUpO1xuICByZXR1cm4gKGlzQmluYXJ5IHx8IHJlSXNPY3RhbC50ZXN0KHZhbHVlKSlcbiAgICA/IGZyZWVQYXJzZUludCh2YWx1ZS5zbGljZSgyKSwgaXNCaW5hcnkgPyAyIDogOClcbiAgICA6IChyZUlzQmFkSGV4LnRlc3QodmFsdWUpID8gTkFOIDogK3ZhbHVlKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB0b051bWJlcjtcbiIsIi8qKlxuICogVnVlIGFuZCBldmVyeSBjb25zdHJ1Y3RvciB0aGF0IGV4dGVuZHMgVnVlIGhhcyBhblxuICogYXNzb2NpYXRlZCBvcHRpb25zIG9iamVjdCwgd2hpY2ggY2FuIGJlIGFjY2Vzc2VkIGR1cmluZ1xuICogY29tcGlsYXRpb24gc3RlcHMgYXMgYHRoaXMuY29uc3RydWN0b3Iub3B0aW9uc2AuXG4gKlxuICogVGhlc2UgY2FuIGJlIHNlZW4gYXMgdGhlIGRlZmF1bHQgb3B0aW9ucyBvZiBldmVyeVxuICogVnVlIGluc3RhbmNlLlxuICovXG4oZnVuY3Rpb24ocm9vdCwgZmFjdG9yeSkge1xuXG4gICAgaWYgKHR5cGVvZiBtb2R1bGUgPT09IFwib2JqZWN0XCIgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgICAgICAgbW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KHJlcXVpcmUoXCJpbnRlcmFjdC5qc1wiKSwgcmVxdWlyZShcImxvZGFzaC90aHJvdHRsZVwiKSwgcmVxdWlyZShcImxvZGFzaC9kZWJvdW5jZVwiKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcm9vdC5Tb3J0YWJsZSA9IGZhY3Rvcnkocm9vdC5pbnRlcmFjdCwgcm9vdC5fLnRocm90dGxlLCByb290Ll8uZGVib3VuY2UpO1xuICAgIH1cblxufSkodGhpcywgZnVuY3Rpb24oaW50ZXJhY3QsIHRocm90dGxlLCBkZWJvdW5jZSl7XG5cbiAgICB2YXIgU29ydGFibGUgPSBmdW5jdGlvbihlbGVtZW50LCBzY3JvbGxhYmxlKXtcbiAgICAgICAgdGhpcy5zY3JvbGxhYmxlID0gc2Nyb2xsYWJsZSB8fCBudWxsO1xuICAgICAgICB0aGlzLmVsZW1lbnQgPSBlbGVtZW50O1xuICAgICAgICB0aGlzLml0ZW1zICAgPSB0aGlzLmVsZW1lbnQucXVlcnlTZWxlY3RvckFsbCh0aGlzLmVsZW1lbnQuZGF0YXNldC5zb3J0YWJsZSk7XG4gICAgICAgIHRoaXMuZWxlbWVudC5zdHlsZS5wb3NpdGlvbiA9IFwicmVsYXRpdmVcIjtcbiAgICAgICAgdGhpcy5lbGVtZW50LnN0eWxlLndlYmtpdFRvdWNoQ2FsbG91dCA9IFwibm9uZVwiO1xuICAgICAgICB0aGlzLmVsZW1lbnQuc3R5bGUud2Via2l0VXNlclNlbGVjdCA9IFwibm9uZVwiO1xuICAgICAgICB0aGlzLmJpbmRFdmVudHMoKTtcbiAgICAgICAgdGhpcy5zZXRQb3NpdGlvbnMoKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgKiBCaW5kIEV2ZW50c1xuICAgICovXG4gICAgU29ydGFibGUucHJvdG90eXBlLmJpbmRFdmVudHMgPSBmdW5jdGlvbigpe1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwicmVzaXplXCIsIGRlYm91bmNlKGZ1bmN0aW9uKCl7XG4gICAgICAgICAgIHNlbGYuc2V0UG9zaXRpb25zKCk7XG4gICAgICAgIH0sIDIwMCkpO1xuICAgICAgICBpbnRlcmFjdCh0aGlzLmVsZW1lbnQuZGF0YXNldC5zb3J0YWJsZSwge1xuICAgICAgICAgICAgY29udGV4dDogdGhpcy5lbGVtZW50XG4gICAgICAgIH0pLmRyYWdnYWJsZSh7XG4gICAgICAgICAgICBpbmVydGlhOiBmYWxzZSxcbiAgICAgICAgICAgIG1hbnVhbFN0YXJ0OiAoXCJvbnRvdWNoc3RhcnRcIiBpbiB3aW5kb3cpIHx8IHdpbmRvdy5Eb2N1bWVudFRvdWNoICYmIHdpbmRvdy5kb2N1bWVudCBpbnN0YW5jZW9mIHdpbmRvdy5Eb2N1bWVudFRvdWNoLFxuICAgICAgICAgICAgYXV0b1Njcm9sbDoge1xuICAgICAgICAgICAgICAgIGNvbnRhaW5lcjogdGhpcy5zY3JvbGxhYmxlLFxuICAgICAgICAgICAgICAgIG1hcmdpbjogNTAsXG4gICAgICAgICAgICAgICAgc3BlZWQ6IDYwMFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG9ubW92ZTogdGhyb3R0bGUoZnVuY3Rpb24oZSl7XG4gICAgICAgICAgICAgICAgc2VsZi5tb3ZlKGUpO1xuICAgICAgICAgICAgfSwgMTYsIHt0cmFpbGluZzogZmFsc2V9KVxuICAgICAgICB9KVxuICAgICAgICAub2ZmKFwiZHJhZ3N0YXJ0XCIpXG4gICAgICAgIC5vZmYoXCJkcmFnZW5kXCIpXG4gICAgICAgIC5vZmYoXCJob2xkXCIpXG4gICAgICAgIC5vbihcImRyYWdzdGFydFwiLCBmdW5jdGlvbihlKXtcbiAgICAgICAgICAgIHZhciByID0gZS50YXJnZXQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICAgICAgICBlLnRhcmdldC5jbGFzc0xpc3QuYWRkKFwiaXMtZHJhZ2dlZFwiKTtcbiAgICAgICAgICAgIGUudGFyZ2V0LnN0eWxlLnRyYW5zaXRpb25EdXJhdGlvbiA9IFwiMHNcIjtcbiAgICAgICAgICAgIHNlbGYuc3RhcnRQb3NpdGlvbiA9IGUudGFyZ2V0LmRhdGFzZXQucG9zaXRpb247XG4gICAgICAgICAgICBzZWxmLm9mZnNldCA9IHtcbiAgICAgICAgICAgICAgICB4OiBlLmNsaWVudFggLSByLmxlZnQsXG4gICAgICAgICAgICAgICAgeTogZS5jbGllbnRZIC0gci50b3BcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBzZWxmLnNjcm9sbFRvcFN0YXJ0ID0gc2VsZi5nZXRTY3JvbGxUb3AoKTtcbiAgICAgICAgfSkub24oXCJkcmFnZW5kXCIsIGZ1bmN0aW9uKGUpe1xuICAgICAgICAgICAgZS50YXJnZXQuY2xhc3NMaXN0LnJlbW92ZShcImlzLWRyYWdnZWRcIik7XG4gICAgICAgICAgICBlLnRhcmdldC5zdHlsZS50cmFuc2l0aW9uRHVyYXRpb24gPSBudWxsO1xuICAgICAgICAgICAgc2VsZi5tb3ZlSXRlbShlLnRhcmdldCwgZS50YXJnZXQuZGF0YXNldC5wb3NpdGlvbik7XG4gICAgICAgICAgICBzZWxmLnNlbmRSZXN1bHRzKCk7XG4gICAgICAgIH0pLm9uKFwiaG9sZFwiLCBmdW5jdGlvbihlKXtcbiAgICAgICAgICAgIGlmKCFlLmludGVyYWN0aW9uLmludGVyYWN0aW5nKCkpe1xuICAgICAgICAgICAgICAgIGUuaW50ZXJhY3Rpb24uc3RhcnQoe1xuICAgICAgICAgICAgICAgICAgICBuYW1lOiBcImRyYWdcIlxuICAgICAgICAgICAgICAgIH0sIGUuaW50ZXJhY3RhYmxlLCBlLmN1cnJlbnRUYXJnZXQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgKiBCdWlsZCB0aGUgZ3JpZFxuICAgICogLSBJdGVtcyBwb3NpdGlvbiBpcyBzZXQgdG8gXCJhYnNvbHV0ZVwiXG4gICAgKiAtIEV2ZXJ5IGl0ZW1zIGlzIHBvc2l0aW9uZWQgdXNpbmcgdHJhbnNmb3JtXG4gICAgKiAtIFRyYW5zaXRpb24gZHVyYXRpb24gaXMgc2V0IHRvIDAgZHVyaW5nIHRoaXMgb3BlcmF0aW9uXG4gICAgKiovXG4gICAgU29ydGFibGUucHJvdG90eXBlLnNldFBvc2l0aW9ucyA9IGZ1bmN0aW9uKCl7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIHJlY3QgPSB0aGlzLml0ZW1zWzBdLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgICB0aGlzLml0ZW1fd2lkdGggPSBNYXRoLmZsb29yKHJlY3Qud2lkdGgpO1xuICAgICAgICB0aGlzLml0ZW1faGVpZ2h0ID0gTWF0aC5mbG9vcihyZWN0LmhlaWdodCk7XG4gICAgICAgIHRoaXMuY29scyA9IE1hdGguZmxvb3IodGhpcy5lbGVtZW50Lm9mZnNldFdpZHRoIC8gdGhpcy5pdGVtX3dpZHRoKTtcbiAgICAgICAgdGhpcy5lbGVtZW50LnN0eWxlLmhlaWdodCA9ICh0aGlzLml0ZW1faGVpZ2h0ICogTWF0aC5jZWlsKHRoaXMuaXRlbXMubGVuZ3RoIC8gdGhpcy5jb2xzKSkgKyBcInB4XCI7XG4gICAgICAgIGZvcih2YXIgaSA9IDAsIHggPSB0aGlzLml0ZW1zLmxlbmd0aDsgaSA8IHg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGl0ZW0gPSB0aGlzLml0ZW1zW2ldO1xuICAgICAgICAgICAgaXRlbS5zdHlsZS5wb3NpdGlvbiA9IFwiYWJzb2x1dGVcIjtcbiAgICAgICAgICAgIGl0ZW0uc3R5bGUudG9wID0gXCIwcHhcIjtcbiAgICAgICAgICAgIGl0ZW0uc3R5bGUubGVmdCA9IFwiMHB4XCI7XG4gICAgICAgICAgICBpdGVtLnN0eWxlLnRyYW5zaXRpb25EdXJhdGlvbiA9IFwiMHNcIjtcbiAgICAgICAgICAgIHRoaXMubW92ZUl0ZW0oaXRlbSwgaXRlbS5kYXRhc2V0LnBvc2l0aW9uKTtcbiAgICAgICAgfVxuICAgICAgICB3aW5kb3cuc2V0VGltZW91dChmdW5jdGlvbigpe1xuICAgICAgICAgICAgIGZvcih2YXIgaSA9IDAsIHggPSBzZWxmLml0ZW1zLmxlbmd0aDsgaSA8IHg7IGkrKykge1xuICAgICAgICAgICAgICAgIHZhciBpdGVtID0gc2VsZi5pdGVtc1tpXTtcbiAgICAgICAgICAgICAgICBpdGVtLnN0eWxlLnRyYW5zaXRpb25EdXJhdGlvbiA9IG51bGw7XG4gICAgICAgICAgICAgfVxuICAgICAgICB9LCAxMDApO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAqIE1vdmUgYW4gZWxlbWVudCB0byBmb2xsb3cgbW91c2UgY3Vyc29yXG4gICAgKiBAcGFyYW0gZSBpbnRlcmFjdC5qcyBldmVudFxuICAgICovXG4gICAgU29ydGFibGUucHJvdG90eXBlLm1vdmUgPSBmdW5jdGlvbihlKXtcbiAgICAgICAgdmFyIHAgPSB0aGlzLmdldFhZKHRoaXMuc3RhcnRQb3NpdGlvbik7XG4gICAgICAgIHZhciB4ID0gcC54ICsgZS5jbGllbnRYIC0gZS5jbGllbnRYMDtcbiAgICAgICAgdmFyIHkgPSBwLnkgKyBlLmNsaWVudFkgLSBlLmNsaWVudFkwICsgdGhpcy5nZXRTY3JvbGxUb3AoKSAtIHRoaXMuc2Nyb2xsVG9wU3RhcnQ7XG4gICAgICAgIGUudGFyZ2V0LnN0eWxlLnRyYW5zZm9ybSA9IFwidHJhbnNsYXRlM0QoXCIgKyB4ICsgXCJweCwgXCIgKyB5ICsgXCJweCwgMClcIjtcbiAgICAgICAgdmFyIG9sZFBvc2l0aW9uID0gcGFyc2VJbnQoZS50YXJnZXQuZGF0YXNldC5wb3NpdGlvbiwgMTApO1xuICAgICAgICB2YXIgbmV3UG9zaXRpb24gPSB0aGlzLmd1ZXNzUG9zaXRpb24oeCArIHRoaXMub2Zmc2V0LngsIHkgKyB0aGlzLm9mZnNldC55KTtcbiAgICAgICAgaWYob2xkUG9zaXRpb24gIT09IG5ld1Bvc2l0aW9uKXtcbiAgICAgICAgICAgIHRoaXMuc3dhcChvbGRQb3NpdGlvbiwgbmV3UG9zaXRpb24pO1xuICAgICAgICAgICAgZS50YXJnZXQuZGF0YXNldC5wb3NpdGlvbiA9IG5ld1Bvc2l0aW9uO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZ3Vlc3NQb3NpdGlvbih4LCB5KTtcbiAgICB9O1xuXG4gICAgLypcbiAgICAqIEdldCBwb3NpdGlvbiBvZiBhbiBlbGVtZW50IHJlbGF0aXZlIHRvIHRoZSBwYXJlbnRcbiAgICAqIHg6MCwgeTowIGJlaW5nIHRoZSB0b3AgbGVmdCBjb3JuZXIgb2YgdGhlIGNvbnRhaW5lclxuICAgICovXG4gICAgU29ydGFibGUucHJvdG90eXBlLmdldFhZID0gZnVuY3Rpb24ocG9zaXRpb24pe1xuICAgICAgICB2YXIgeCA9IHRoaXMuaXRlbV93aWR0aCAqIChwb3NpdGlvbiAlIHRoaXMuY29scyk7XG4gICAgICAgIHZhciB5ID0gdGhpcy5pdGVtX2hlaWdodCAqIE1hdGguZmxvb3IocG9zaXRpb24gLyB0aGlzLmNvbHMpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgeDogeCxcbiAgICAgICAgICAgIHk6IHlcbiAgICAgICAgfTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgKiBHdWVzcyB0aGUgcG9zaXRpb24gbnVtYmVyIGZyb20geCwgeVxuICAgICogQHBhcmFtIHhcbiAgICAqIEBwYXJhbSB5XG4gICAgKiBAcmV0dXJucyB7bnVtYmVyfVxuICAgICovXG4gICAgU29ydGFibGUucHJvdG90eXBlLmd1ZXNzUG9zaXRpb24gPSBmdW5jdGlvbih4LCB5KXtcbiAgICAgICAgdmFyIGNvbCA9IE1hdGguZmxvb3IoeCAvIHRoaXMuaXRlbV93aWR0aCk7XG4gICAgICAgIGlmKGNvbCA+PSB0aGlzLmNvbHMpe1xuICAgICAgICAgICAgY29sID0gdGhpcy5jb2xzIC0gMTtcbiAgICAgICAgfVxuICAgICAgICBpZihjb2wgPD0gMCl7XG4gICAgICAgICAgICBjb2wgPSAwO1xuICAgICAgICB9XG4gICAgICAgIHZhciByb3cgPSBNYXRoLmZsb29yKHkgLyB0aGlzLml0ZW1faGVpZ2h0KTtcbiAgICAgICAgaWYocm93IDwgMCl7XG4gICAgICAgICAgICByb3cgPSAwO1xuICAgICAgICB9XG4gICAgICAgIHZhciBwb3NpdGlvbiA9IGNvbCArIHJvdyAqIHRoaXMuY29scztcbiAgICAgICAgaWYocG9zaXRpb24gPj0gdGhpcy5pdGVtcy5sZW5ndGgpe1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaXRlbXMubGVuZ3RoIC0gMTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcG9zaXRpb247XG4gICAgfTtcblxuICAgIC8qKlxuICAgICogR3Vlc3MgdGhlIHBvc2l0aW9uIGZyb20geCwgeVxuICAgICogQHBhcmFtIHN0YXJ0XG4gICAgKiBAcGFyYW0gZW5kXG4gICAgKi9cbiAgICBTb3J0YWJsZS5wcm90b3R5cGUuc3dhcCA9IGZ1bmN0aW9uKHN0YXJ0LCBlbmQpe1xuICAgICAgICBmb3IodmFyIGkgPSAwLCB4ID0gdGhpcy5pdGVtcy5sZW5ndGg7IGkgPCB4OyBpKyspIHtcbiAgICAgICAgICAgIHZhciBpdGVtID0gdGhpcy5pdGVtc1tpXTtcbiAgICAgICAgICAgIGlmKCFpdGVtLmNsYXNzTGlzdC5jb250YWlucyhcImlzLWRyYWdnZWRcIikpe1xuICAgICAgICAgICAgICAgIHZhciBwb3NpdGlvbiA9IHBhcnNlSW50KGl0ZW0uZGF0YXNldC5wb3NpdGlvbiwgMTApO1xuICAgICAgICAgICAgICAgIGlmKHBvc2l0aW9uID49IGVuZCAmJiBwb3NpdGlvbiA8IHN0YXJ0ICYmIGVuZCA8IHN0YXJ0KXtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5tb3ZlSXRlbShpdGVtLCBwb3NpdGlvbiArIDEpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZihwb3NpdGlvbiA8PSBlbmQgJiYgcG9zaXRpb24gPiBzdGFydCAmJiBlbmQgPiBzdGFydCl7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubW92ZUl0ZW0oaXRlbSwgcG9zaXRpb24gLSAxKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgLyoqXG4gICAgKiBNb3ZlIGFuIGl0ZW0gdG8gaGlzIG5ldyBwb3NpdGlvblxuICAgICogQHBhcmFtIGl0ZW1cbiAgICAqIEBwYXJhbSBwb3NpdGlvblxuICAgICovXG4gICAgU29ydGFibGUucHJvdG90eXBlLm1vdmVJdGVtID0gZnVuY3Rpb24oaXRlbSwgcG9zaXRpb24pe1xuICAgICAgICB2YXIgcCA9IHRoaXMuZ2V0WFkocG9zaXRpb24pO1xuICAgICAgICBpdGVtLnN0eWxlLnRyYW5zZm9ybSA9IFwidHJhbnNsYXRlM0QoXCIgKyBwLnggKyBcInB4LCBcIiArIHAueSArIFwicHgsIDApXCI7XG4gICAgICAgIGl0ZW0uZGF0YXNldC5wb3NpdGlvbiA9IHBvc2l0aW9uO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAqIFNlbmQgcmVzdWx0c1xuICAgICogQHBhcmFtIGl0ZW1cbiAgICAqIEBwYXJhbSBwb3NpdGlvblxuICAgICovXG4gICAgU29ydGFibGUucHJvdG90eXBlLnNlbmRSZXN1bHRzID0gZnVuY3Rpb24oKXtcbiAgICAgICAgdmFyIHJlc3VsdHMgPSB7fTtcbiAgICAgICAgZm9yKHZhciBpID0gMCwgeCA9IHRoaXMuaXRlbXMubGVuZ3RoOyBpIDwgeDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgaXRlbSA9IHRoaXMuaXRlbXNbaV07XG4gICAgICAgICAgICByZXN1bHRzW2l0ZW0uZGF0YXNldC5pZF0gPSBpdGVtLmRhdGFzZXQucG9zaXRpb247XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zdWNjZXNzKHJlc3VsdHMpO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBHZXQgY29udGFpbmVyIHNjcm9sbFRvcFxuICAgICAqIChmaXggYnVnIGluIGNocm9tZSwgYm9keS5zY3JvbGxUb3AgaXMgZGVwcmVjYXRlZClcbiAgICAgKi9cbiAgICBTb3J0YWJsZS5wcm90b3R5cGUuZ2V0U2Nyb2xsVG9wID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjcm9sbGFibGUgPyB0aGlzLnNjcm9sbGFibGUuc2Nyb2xsVG9wIDogKHdpbmRvdy5kb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc2Nyb2xsVG9wIHx8IHdpbmRvdy5kb2N1bWVudC5ib2R5LnNjcm9sbFRvcCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIFNvcnRhYmxlO1xufSk7IiwiLy8gVXNlZCBmb3IgZ3VscCB0YXNrICh1c2VsZXNzIG90aGVyd2lzZSlcbndpbmRvdy5Tb3J0YWJsZSA9IHJlcXVpcmUoJy4vU29ydGFibGUnKTsiXX0=

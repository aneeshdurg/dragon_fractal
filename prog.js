async function loadTwgl() {
    const p = new Promise((resolve) => {
        const script = document.createElement("script");
        script.type = "text/javascript";
        script.src = "https://twgljs.org/dist/4.x/twgl-full.min.js";
        script.onreadystatechange = resolve;
        script.onload = resolve;
        document.head.appendChild(script);
    });
    return p;
}

_fileCache = {}
async function getFile(url) {
    if (url in _fileCache)
        return _fileCache[url];

    const resp = await fetch(url);
    if (resp.status !== 200)
        throw("Could not find shader " + url);

    let fileContents = "";
    const reader = resp.body.getReader();
    done = false;
    while (!done) {
        let fileBody = await reader.read();
        if (!fileBody.value) {
            done = true;
        } else {
            fileContents += String.fromCharCode.apply(null, fileBody.value);
        }
    }
    _fileCache[url] = fileContents;
    return fileContents;
}

/**
 * @param gl webgl2 instance
 * @param dimensions [width, height] tuple for texture dimensions
 * @param data - can be null, if not will be used as the source for the texture
 */
function createTexture(gl, dimensions, data) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0, // level
        gl.RGBA32F, // internal format
        dimensions[0], // width
        dimensions[1], // height
        0, // border
        gl.RGBA, // format
        gl.FLOAT, // type
        data, /* source */);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    return tex;
}

function render(gl) {
    // draw the quad (2 triangles)
    const offset = 0;
    const numVertices = 6;
    gl.drawArrays(gl.TRIANGLES, offset, numVertices);
}

function setupProgram(gl, programInfo, bufferInfo) {
    gl.useProgram(programInfo.program);

    twgl.setBuffersAndAttributes(gl, programInfo, bufferInfo);

}

function enableGlExts(gl) {
    gl.getExtension('OES_texture_float');        // just in case
    gl.getExtension('OES_texture_float_linear');
    ext = gl.getExtension('EXT_color_buffer_float');
    if (!ext) {
        alert("no ext color...");
        throw new Error("!");
    }
}

const vs = `
    #version 300 es
    in vec4 position;
    void main() {
      gl_Position = position;
    }`;

const bufferArrays = {
    position: {
        data: [
          -1, -1,
           1, -1,
          -1,  1,
          -1,  1,
           1, -1,
           1,  1,
        ],
        numComponents: 2,
    },
};

var gl = null;

class FrameBufferManager {
    constructor(gl, dimensions) {
        this.computeDsts = [
            createTexture(gl, dimensions, null),
            createTexture(gl, dimensions, null)
        ];
        this.fb = gl.createFramebuffer();

        this.counter = 0;
    }

    src() {
        return this.computeDsts[this.counter];
    }

    dst() {
        return this.computeDsts[(this.counter + 1) % 2];
    }

    flipflop() {
        this.counter = this.counter + 1;
        this.counter %= 2;
    }

    bind_dst() {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.dst(), 0 /* level */);
    }
}

class DragonFractal {
    constructor(start, end) {
        this.start = start;
        this.end = end;

        this.left = start[0] < end[0] ? (end[0] - start[0]) : 0;
        this.right = start[0] > end[0] ? (start[0] - end[0]) : 0;
        this.up = start[1] < end[1] ? (end[1] - start[1]) : 0;
        this.down = start[1] > end[1] ? (start[1] - end[1]) : 0;
    }

    rotate_around_origin(point, origin, angle) {
        // transform end to origin
        const transformed_start = [point[0] - origin[0], point[1] - origin[1]];

        // convert to polar coords
        const r = Math.sqrt(Math.pow(transformed_start[0], 2) + Math.pow(transformed_start[1], 2))
        let theta = Math.atan(transformed_start[1] / transformed_start[0]);
        if (transformed_start[0] == 0 && transformed_start[1] == 0)
            theta = 0;
        if (transformed_start[0] < 0)
            theta += Math.PI;

        theta += angle;

        // convert to cartesian coords and undo transform
        const transformed_new_point = [r * Math.cos(theta), r * Math.sin(theta)];
        return [transformed_new_point[0] + origin[0], transformed_new_point[1] + origin[1]]
    }

    rotate_around_end(point, angle) {
        return this.rotate_around_origin(point, this.end, angle);
    }

    update(angle) {
        const new_left = this.rotate_around_origin([-1 * this.left, 0], [0, 0], angle);
        const new_right = this.rotate_around_origin([this.right, 0], [0, 0], angle);
        const new_up = this.rotate_around_origin([0, this.up], [0, 0], angle);
        const new_down = this.rotate_around_origin([0, -1 * this.down], [0, 0], angle);

        const next_left = -1 * Math.min(new_left[0], new_right[0], new_up[0], new_down[0], -1 * this.left);
        const next_right = Math.max(new_left[0], new_right[0], new_up[0], new_down[0], this.right);
        const next_up = Math.max(new_left[1], new_right[1], new_up[1], new_down[1], this.up);
        const next_down = -1 * Math.min(new_left[1], new_right[1], new_up[1], new_down[1], -1 * this.down);

        const new_end = this.rotate_around_end(this.start, angle);
        // need to make new_dirs in terms of next_end
        return {
            end: new_end,
            bounds: [
                next_left - (this.end[0] - new_end[0]),
                next_right + (this.end[0] - new_end[0]),
                next_up + (this.end[1] - new_end[1]),
                next_down - (this.end[1] - new_end[1]),
            ]
        };
    }

    update_end(angle) {
        const new_state = this.update(angle);
        this.end = new_state.end;
        this.left = new_state.bounds[0];
        this.right = new_state.bounds[1];
        this.up = new_state.bounds[2];
        this.down = new_state.bounds[3];
    }

    scale(dimensions) {
        // TODO zoom out so that the dimensions below always fit in the display
        // and only use screen coordinates for computation.
        // console.log("Required dimensions:", Math.ceil(d.right + d.left), Math.ceil(d.up + d.down));
        // if max(dimensions) > 1000
        //   scale to 1000 and adjust d.end to be in screen coords
        const scale = Math.max(this.left + this.right, this.up + this.down) + 500;

        if (scale <= dimensions[0])
            return;

        const ratio = dimensions[0]/scale;

        this.end[0] *= ratio;
        this.end[1] *= ratio;

        this.start[0] *= ratio;
        this.start[1] *= ratio;

        this.left *= ratio;
        this.right *= ratio;
        this.up *= ratio;
        this.down *= ratio;
    }
}

async function main(canvas, root, fps) {
    fps = fps || 30;
    root = root || ".";

    await loadTwgl();

    const dimensions = [1000, 1000];

    canvas.width = dimensions[0];
    canvas.height = dimensions[1];
    gl = canvas.getContext("webgl2"/*, {premultipliedAlpha: false}*/);
    if (!gl)
        throw new Error("Could not initialize webgl2 context! Does your browser support webgl2?");
    enableGlExts(gl);

    const fragShader = await getFile(root + "/compute.frag.c");
    const programInfo = twgl.createProgramInfo(gl, [vs, fragShader]);
    const bufferInfo = twgl.createBufferInfoFromArrays(gl, bufferArrays);
    setupProgram(gl, programInfo, bufferInfo);

    let ANGLE = window.ANGLE || (Math.PI / 2 - Math.PI / 32);

    const line_length = 10;
    const area_length = 10;
    const d = new DragonFractal([0, 0], [area_length, 0])

    const fbs = new FrameBufferManager(gl, dimensions);

    // Set up parameters for compute
    twgl.setUniforms(programInfo, {
        u_angle: ANGLE,
        u_dimensions: dimensions,
        u_initialize: true,
        u_initial_length: line_length,
        u_render: false,
        u_texture: fbs.src(),
    });

    fbs.bind_dst();
    gl.finish();

    render(gl);
    gl.finish();

    fbs.flipflop();

    let iteration_i = 0;

    let pause = false;

    async function run() {
        function draw_angle(angle, scale) {
            // TODO only use one number for dimensions and always assume square
            twgl.setUniforms(programInfo, {
                u_angle: angle,
                u_dimensions: dimensions,
                u_initialize: false,
                u_render: false,
                u_texture: fbs.src(),
                u_pivot: d.end,
                u_scale: scale
            });

            fbs.bind_dst();
            gl.finish();

            render(gl);
            gl.finish();

            // Set up parameters for render
            twgl.setUniforms(programInfo, {
                u_render: true,
                u_texture: fbs.dst(),
                u_texture_1: fbs.src(),
                u_dimensions: dimensions,
            });

            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            render(gl);
            gl.finish();
        }

        const new_state = d.update(ANGLE);
        const scale = Math.max(
            new_state.bounds[0] + new_state.bounds[1],
            new_state.bounds[2] + new_state.bounds[3]
        ) + 500;
        let curr_scale = dimensions[0];
        let scale_step = 0;
        if (scale > dimensions[0])
            scale_step = (scale - dimensions[0]) / 10;


        const step = ANGLE / 10;
        let i = step;
        while (i < ANGLE) {
            i += step;
            curr_scale += scale_step;
            draw_angle(i, curr_scale);
            await new Promise(r => setTimeout(r, 20));
        }

        draw_angle(ANGLE, scale);

        d.update_end(ANGLE);
        d.scale(dimensions);

        fbs.flipflop();
        iteration_i += 1;
        if (iteration_i % 4 == 0)
            iteration_i = 0;

        // ANGLE += Math.PI / 3;
        // if (ANGLE >= 2 * Math.PI)
        //     ANGLE -= 2 * Math.PI;
        if (!pause)
            setTimeout(run, 250);
    }

    run();

    return function() { pause = !pause; };
}

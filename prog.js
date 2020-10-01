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

class FrameBufferManager {
    constructor(gl, dimensions) {
        this.computeDsts = [
            createTexture(gl, dimensions, null),
            createTexture(gl, dimensions, null)
        ];
        this.fb = gl.createFramebuffer();

        this.counter = 0;
        this.gl = gl;
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
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.fb);
        this.gl.framebufferTexture2D(
            this.gl.FRAMEBUFFER,
            this.gl.COLOR_ATTACHMENT0,
            this.gl.TEXTURE_2D,
            this.dst(),
            0 /* level */
        );
    }
}

class DragonFractalState {
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

    get_scale(left, right, up, down) {
        return Math.max(left + right, up + down) + 500;
    }

    scale(dimensions) {
        // TODO zoom out so that the dimensions below always fit in the display
        // and only use screen coordinates for computation.
        // console.log("Required dimensions:", Math.ceil(d.right + d.left), Math.ceil(d.up + d.down));
        // if max(dimensions) > 1000
        //   scale to 1000 and adjust d.end to be in screen coords
        const scale = this.get_scale(this.left, this.right, this.up, this.down);

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

class DragonFractal {
    dimensions = [1000, 1000];
    angle = Math.PI / 2;
    angle_update = null;

    line_length = 10;
    area_length = 10;

    steps = 10;

    stop = false;

    iterations = -1;

    constructor(canvas, fragShader) {
        canvas.width = this.dimensions[0];
        canvas.height = this.dimensions[1];
        this.gl = canvas.getContext("webgl2"/*, {premultipliedAlpha: false}*/);
        if (!this.gl)
            throw new Error("Could not initialize webgl2 context! Does your browser support webgl2?");
        enableGlExts(this.gl);

        this.programInfo = twgl.createProgramInfo(this.gl, [vs, fragShader]);
        const bufferInfo = twgl.createBufferInfoFromArrays(this.gl, bufferArrays);
        setupProgram(this.gl, this.programInfo, bufferInfo);

        this.fbs = new FrameBufferManager(this.gl, this.dimensions);
        this.state = new DragonFractalState([0, 0], [this.area_length, 0]);
    }

    render_initial() {
        // Set up parameters for compute
        twgl.setUniforms(this.programInfo, {
            u_angle: this.angle,
            u_dimensions: this.dimensions,
            u_initialize: true,
            u_initial_length: this.line_length,
            u_render: false,
            u_texture: this.fbs.src(),
        });

        this.fbs.bind_dst();
        this.gl.finish();

        render(this.gl);
        this.gl.finish();

        this.fbs.flipflop();
    }

    render_angle(angle, scale) {
        // TODO only use one number for dimensions and always assume square
        twgl.setUniforms(this.programInfo, {
            u_angle: angle,
            u_dimensions: this.dimensions,
            u_initialize: false,
            u_render: false,
            u_texture: this.fbs.src(),
            u_pivot: this.state.end,
            u_scale: scale
        });

        this.fbs.bind_dst();
        this.gl.finish();

        render(this.gl);
        this.gl.finish();

        // Set up parameters for render
        twgl.setUniforms(this.programInfo, {
            u_render: true,
            u_texture: this.fbs.dst(),
            u_dimensions: this.dimensions,
        });

        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        render(this.gl);
        this.gl.finish();
    }

    start() {
        this.render_initial();
        this.run();
    }

    async run() {
        const new_state = this.state.update(this.angle);
        const scale = this.state.get_scale(
            new_state.bounds[0], new_state.bounds[1], new_state.bounds[2], new_state.bounds[3]
        );
        let curr_scale = this.dimensions[0];
        let scale_step = 0;
        if (scale > curr_scale)
            scale_step = (scale - curr_scale) / this.steps;


        const step = this.angle / this.steps;
        let i = step;
        while (i < this.angle) {
            i += step;
            curr_scale += scale_step;
            this.render_angle(i, curr_scale);

            await new Promise(r => setTimeout(r, 20));
        }

        this.render_angle(this.angle, scale);

        this.state.update_end(this.angle);
        this.state.scale(this.dimensions);

        this.fbs.flipflop();

        if (this.angle_update)
            this.angle = this.angle_update(this.angle);

        if (this.iterations > 0)
            this.iterations--;

        if (!this.stop && (this.iterations != 0))
            setTimeout(this.run.bind(this), 250);
    }
}

async function main(canvas, root) {
    root = root || ".";

    await loadTwgl();
    const fragShader = await getFile(root + "/compute.frag.c");

    const fractal = new DragonFractal(canvas, fragShader);
    fractal.start();

    // const fractal2 = new DragonFractal(canvas2, fragShader);
    // fractal2.angle = Math.PI / 4;
    // fractal2.angle_update = (angle) => {
    //     let new_angle = angle + Math.PI / 4;
    //     if (new_angle >= 2 * Math.PI)
    //         new_angle -= 2 * Math.PI;
    //     return new_angle;
    // };
    // fractal2.start();
    return fractal;
}

import { useAsync, useFetch } from "../src";
import { shallowMount } from "@vue/test-utils";
import flushPromises from "flush-promises";

// setup vue
import Vue from "vue";
import { plugin, value } from "vue-function-api";
Vue.use(plugin);

// component helpers
function createComponentWithUseAsync(promiseFn, params) {
  return {
    setup() {
      return useAsync(promiseFn, params);
    },
    render: h => h()
  };
}

function createComponentWithUseFetch(requestInfo, requestInit) {
  return {
    setup() {
      return useFetch(requestInfo, requestInit);
    },
    render: h => h()
  };
}

describe("useAsync", () => {
  it("returns initial values", () => {
    const promiseFn = async () => {};
    const Component = createComponentWithUseAsync(promiseFn);

    const wrapper = shallowMount(Component);

    expect(wrapper.vm.isLoading).toBe(true);
    expect(wrapper.vm.error).toBeUndefined();
    expect(wrapper.vm.data).toBeUndefined();
    expect(wrapper.vm.retry).toBeDefined();
    expect(wrapper.vm.abort).toBeDefined();
  });

  it("updates reactive values when promise resolves", async () => {
    const promiseFn = () => Promise.resolve("done");
    const Component = createComponentWithUseAsync(promiseFn);

    const wrapper = shallowMount(Component);
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.isLoading).toBe(false);
    expect(wrapper.vm.error).toBeUndefined();
    expect(wrapper.vm.data).toBe("done");
  });

  it("updates reactive values when promise rejects", async () => {
    const promiseFn = () => Promise.reject("error");
    const Component = createComponentWithUseAsync(promiseFn);

    const wrapper = shallowMount(Component);
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.isLoading).toBe(false);
    expect(wrapper.vm.error).toBe("error");
    expect(wrapper.vm.data).toBeUndefined();
  });

  it("retries original promise when retry is called", async () => {
    let fail = true;
    const promiseFn = jest.fn(() =>
      fail ? Promise.reject("error") : Promise.resolve("done")
    );
    const Component = createComponentWithUseAsync(promiseFn);
    const wrapper = shallowMount(Component);
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.isLoading).toBe(false);
    expect(wrapper.vm.error).toBe("error");
    expect(wrapper.vm.data).toBeUndefined();
    expect(promiseFn).toBeCalledTimes(1);

    fail = false;
    wrapper.vm.retry();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.isLoading).toBe(true);
    expect(wrapper.vm.error).toBeUndefined();
    expect(wrapper.vm.data).toBeUndefined();
    expect(promiseFn).toBeCalledTimes(2);

    await flushPromises();
    expect(wrapper.vm.isLoading).toBe(false);
    expect(wrapper.vm.error).toBeUndefined();
    expect(wrapper.vm.data).toBe("done");
  });

  it("sends abort signal to promise when abort is called", async () => {
    let aborted = false;
    const promiseFn = async (params, signal) => {
      signal.addEventListener("abort", () => {
        aborted = true;
      });
    };
    const Component = createComponentWithUseAsync(promiseFn);
    const wrapper = shallowMount(Component);
    expect(wrapper.vm.isLoading).toBe(true);

    wrapper.vm.abort();

    expect(wrapper.vm.isLoading).toBe(false);
    expect(wrapper.vm.error).toBeUndefined();
    expect(wrapper.vm.data).toBeUndefined();
    expect(aborted).toBe(true);
  });

  it("aborts promise when component is destroyed", async () => {
    let aborted = false;
    const promiseFn = async (params, signal) => {
      signal.addEventListener("abort", () => {
        aborted = true;
      });
    };
    const Component = createComponentWithUseAsync(promiseFn);
    const wrapper = shallowMount(Component);

    wrapper.destroy();

    expect(aborted).toBe(true);
  });

  it("calls promiseFn with provided params argument", () => {
    const promiseFn = jest.fn(async () => {});
    const params = {};
    const Component = createComponentWithUseAsync(promiseFn, params);

    shallowMount(Component);

    expect(promiseFn).toBeCalledWith(params, expect.any(Object));
  });

  it("accepts value wrapped arguments", async () => {
    const promiseFn = value(async ({ msg }) => msg);
    const params = value({ msg: "done" });
    const Component = createComponentWithUseAsync(promiseFn, params);

    const wrapper = shallowMount(Component);
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.isLoading).toBe(false);
    expect(wrapper.vm.error).toBeUndefined();
    expect(wrapper.vm.data).toBe("done");
  });

  it("retries original promise when value wrapped promiseFn is changed", async () => {
    const promiseFn = async () => "done";
    const wrapPromiseFn = value(promiseFn);
    const Component = createComponentWithUseAsync(wrapPromiseFn);
    const wrapper = shallowMount(Component);
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.isLoading).toBe(false);
    expect(wrapper.vm.error).toBeUndefined();
    expect(wrapper.vm.data).toBe("done");

    wrapPromiseFn.value = async () => "done again";
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.isLoading).toBe(true);
    expect(wrapper.vm.error).toBeUndefined();
    expect(wrapper.vm.data).toBe("done");

    await wrapper.vm.$nextTick();
    expect(wrapper.vm.isLoading).toBe(false);
    expect(wrapper.vm.error).toBeUndefined();
    expect(wrapper.vm.data).toBe("done again");
  });

  it("retries original promise within wrapped value when retry is called", async () => {
    const promiseFn = jest.fn(async () => "done");
    const wrapPromiseFn = jest.fn(promiseFn);
    const Component = createComponentWithUseAsync(wrapPromiseFn);
    const wrapper = shallowMount(Component);
    expect(promiseFn).toBeCalledTimes(1);

    wrapper.vm.retry();
    await wrapper.vm.$nextTick();

    expect(promiseFn).toBeCalledTimes(2);
  });
});

describe("useFetch", () => {
  const jsonResult = { success: true };
  const textResult = "success";
  const response = {
    ok: true,
    json: async () => jsonResult,
    text: async () => textResult
  };

  beforeEach(() => {
    const fetch = jest.fn().mockImplementation(async () => response);
    global.fetch = fetch;
  });

  afterEach(() => {
    global.fetch.mockClear();
    delete global.fetch;
  });

  it("calls fetch with requestInfo and requestInit arguments including signal, returns values", async () => {
    const requestInfo = "http://some-url.local";
    const requestInit = { headers: { Accept: "application/json" } };
    const Component = createComponentWithUseFetch(requestInfo, requestInit);

    const wrapper = shallowMount(Component);
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.isLoading).toBe(true);
    expect(wrapper.vm.error).toBeUndefined();
    expect(wrapper.vm.data).toBeUndefined();
    expect(wrapper.vm.retry).toBeDefined();
    expect(wrapper.vm.abort).toBeDefined();
    expect(fetch).toBeCalledWith(
      requestInfo,
      expect.objectContaining(requestInit)
    );
    expect(fetch.mock.calls[0][1].signal).toBeDefined();

    await wrapper.vm.$nextTick();
    expect(wrapper.vm.isLoading).toBe(false);
    expect(wrapper.vm.error).toBeUndefined();
    expect(wrapper.vm.data).toBe(jsonResult);
  });

  it("resolves to text response when no json header is set", async () => {
    const Component = createComponentWithUseFetch("");

    const wrapper = shallowMount(Component);
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.isLoading).toBe(true);

    await wrapper.vm.$nextTick();
    expect(wrapper.vm.isLoading).toBe(false);
    expect(wrapper.vm.error).toBeUndefined();
    expect(wrapper.vm.data).toBe(textResult);
  });

  it("rejects with bad response when response is not ok", async () => {
    const Component = createComponentWithUseFetch("");
    response.ok = false;

    const wrapper = shallowMount(Component);
    expect(wrapper.vm.isLoading).toBe(true);

    await wrapper.vm.$nextTick();
    expect(wrapper.vm.isLoading).toBe(false);
    expect(wrapper.vm.error).toEqual(response);
    expect(wrapper.vm.data).toBeUndefined();
  });
});
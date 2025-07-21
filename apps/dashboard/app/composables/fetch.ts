import { toast } from "vue-sonner";

interface UseFetchyOptions {
  alert?: boolean;
  suppress?: boolean;
}

export async function useFetchy<T = any>(
  request: string,
  opts: UseFetchyOptions = {},
): Promise<any> {
  opts.alert = opts.alert ?? true;
  opts.suppress = opts.suppress ?? true;

  let successMessage = "";
  let errorMessage = "";

  const result = await useFetch<T>(request, {
    ...opts,
    onResponse({ response }) {
      if (response.ok) {
        successMessage = response._data?.message;
      } else {
        errorMessage = response._data?.message || response.statusText;
      }
    },
  });

  if (opts.alert && errorMessage) {
    toast("Something went wrong", {
      description: errorMessage,
    });
  }

  if (opts.alert && successMessage) {
    toast("Success", {
      description: successMessage,
    });
  }

  if (!opts.suppress && result.error.value) {
    throw result.error.value;
  }

  return result;
}
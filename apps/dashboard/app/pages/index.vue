<script setup lang="ts">
import { toast } from "vue-sonner";

definePageMeta({
  middleware: ["guest"],
  layout: "auth",
});

const auth = useAuth();
const loading = ref(false);

async function signIn() {
  try {
    loading.value = true;

    const { error, data } = await auth.signIn.social({
      provider: "discord",
      callbackURL: "/app/user",
    });

    if (data) {
      toast("Success", {
        description: "Successfully signed in.",
      });
      await navigateTo("/app/user");
    } else {
      toast("Error", {
        description: `Error: ${error.message}`,
      });
    }
  } catch (error: any) {
    toast("Error", {
      description: `Error: ${error.message}`,
    });
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-background">
    <Card class="mx-auto w-full max-w-md">
      <CardHeader class="space-y-1">
        <CardTitle class="text-2xl font-bold"> Sign In with Discord </CardTitle>
        <CardDescription>
          Sign in with your Discord account to access your dashboard and manage
          your servers.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button class="w-full" variant="outline" :disabled="loading" @click="signIn">
          <Icon name="simple-icons:discord" class="mr-2 h-4 w-4" />
          Login
        </Button>
      </CardContent>
      <Separator />
      <CardFooter class="text-center text-sm text-muted-foreground">
        <span>Need help? Contact @taskylizard for support.</span>
      </CardFooter>
    </Card>
  </div>
</template>
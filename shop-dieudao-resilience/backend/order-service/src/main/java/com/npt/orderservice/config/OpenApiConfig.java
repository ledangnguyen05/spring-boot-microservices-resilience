package com.npt.orderservice.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI orderOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("Order Service - Resilience API")
                        .description("API minh họa 4 mẫu Resilience trong Microservices: CircuitBreaker, Bulkhead, Timeout, Retry và cơ chế Fallback")
                        .version("1.0.0"));
    }
}


import { UserDto } from './models.js';
import type { User } from './models.js';

// Simulated NestJS-style decorator usage

@Module({
  imports: [AuthModule],
  controllers: [UserController],
  providers: [UserService],
})
export class AppModule {}

@Controller('users')
@UseGuards(AuthGuard)
export class UserController {
  @Post()
  @ApiBody({ type: UserDto })
  create(@Body() dto: UserDto): User {
    return dto as unknown as User;
  }
}

@Injectable()
export class UserService {}

@Type(() => UserDto)
export class NestedExample {}

// These are referenced only via decorators / type annotations above
export class AuthModule {}
export class AuthGuard {}

function Module(_opts: any) { return (_target: any) => {}; }
function Controller(_path: string) { return (_target: any) => {}; }
function UseGuards(..._guards: any[]) { return (_target: any) => {}; }
function Injectable() { return (_target: any) => {}; }
function Post() { return (_target: any, _key: string) => {}; }
function ApiBody(_opts: any) { return (_target: any, _key: string) => {}; }
function Body() { return (_target: any, _key: string, _idx: number) => {}; }
function Type(_fn: () => any) { return (_target: any) => {}; }
